'use strict';
// Presentazione delle foto (ticket #9): avvio dalla galleria, una foto ogni 10 secondi, uscita con tocco o "indietro".
const { test, assert, attendi } = require('../lib/test');
const img = require('../lib/immagini');

const ORA = '2026-05-10T10:00';

function griglia(page) { return page.getByRole('list', { name: 'Foto' }); }
function pulsante(page) { return page.getByRole('button', { name: 'Presentazione' }); }
function presentazione(page) { return page.getByRole('dialog', { name: 'Presentazione' }); }

async function treFoto(app) {
  for (const [nome, colore] of [['uno.jpg', '#ff0000'], ['due.jpg', '#00ff00'], ['tre.jpg', '#0000ff']]) {
    const f = await img.crea(app.page, { larghezza: 400, altezza: 300, nome, colore });
    await app.page.getByLabel('Aggiungi foto').setInputFiles(f);
    await attendi(async () => assert.ok(await griglia(app.page).getByRole('button', { name: 'Apri ' + nome }).count()));
  }
}

test('il pulsante "Presentazione" c\'è solo se la galleria contiene foto', async ({ apri }) => {
  const app = await apri({ percorso: '#/foto' });
  assert.match(await app.page.locator('main').textContent(), /Nessuna foto/);
  assert.equal(await pulsante(app.page).count(), 0);
  await treFoto(app);
  await attendi(async () => assert.equal(await pulsante(app.page).isVisible(), true));
  // Eliminate tutte le foto, il pulsante sparisce.
  await app.page.evaluate(async () => { for (const m of await CasaNostra.foto.elenco()) await CasaNostra.foto.elimina(m.id); });
  await app.ricarica();
  assert.equal(await pulsante(app.page).count(), 0);
});

async function nomeCorrente(page) {
  return presentazione(page).getByRole('img').getAttribute('alt');
}

async function attendiFoto(page, nome) {
  await attendi(async () => {
    assert.equal(await nomeCorrente(page), nome);
    const caricata = await presentazione(page).getByRole('img').evaluate((i) => i.complete && i.naturalWidth);
    assert.equal(caricata, 400);
  });
}

test('con l\'orologio simulato la foto cambia ogni 10 secondi e alla fine ricomincia dalla prima', async ({ apri }) => {
  const app = await apri({ percorso: '#/foto', ora: ORA, oraFissa: true });
  await treFoto(app);
  await pulsante(app.page).click();
  await attendiFoto(app.page, 'tre.jpg'); // dalla più recente, come la galleria
  await app.avanzaOra(9000);
  assert.equal(await nomeCorrente(app.page), 'tre.jpg');
  await app.avanzaOra(1000);
  await attendiFoto(app.page, 'due.jpg');
  await app.avanzaOra(10000);
  await attendiFoto(app.page, 'uno.jpg');
  await app.avanzaOra(10000);
  await attendiFoto(app.page, 'tre.jpg');
});

// scriptIniziale: come img.tracciaUrl, più il picco di URL blob: attivi insieme (window.__piccoUrl, azzerabile).
function tracciaPicco() {
  const crea = URL.createObjectURL.bind(URL);
  const revoca = URL.revokeObjectURL.bind(URL);
  window.__urlAttivi = new Set();
  window.__piccoUrl = 0;
  URL.createObjectURL = function (o) {
    const u = crea(o);
    window.__urlAttivi.add(u);
    window.__piccoUrl = Math.max(window.__piccoUrl, window.__urlAttivi.size);
    return u;
  };
  URL.revokeObjectURL = function (u) { window.__urlAttivi.delete(u); return revoca(u); };
}

test('mai più di 2 foto piene caricate insieme e nessun URL temporaneo resta attivo dopo l\'uscita', async ({ apri }) => {
  const app = await apri({ percorso: '#/foto', ora: ORA, oraFissa: true, scriptIniziale: tracciaPicco });
  await treFoto(app);
  const attivi = () => app.page.evaluate(() => window.__urlAttivi.size);
  await attendi(async () => assert.equal(await attivi(), 3)); // le 3 miniature della galleria
  await app.page.evaluate(() => { window.__piccoUrl = window.__urlAttivi.size; });
  await pulsante(app.page).click();
  await attendiFoto(app.page, 'tre.jpg');
  for (const nome of ['due.jpg', 'uno.jpg', 'tre.jpg', 'due.jpg']) {
    await app.avanzaOra(10000);
    await attendiFoto(app.page, nome);
    assert.ok(await attivi() <= 3 + 2, 'corrente e successiva al massimo');
  }
  assert.equal(await presentazione(app.page).getByRole('img').count(), 1);
  assert.ok(await app.page.evaluate(() => window.__piccoUrl) - 3 <= 2, 'mai più di 2 foto piene insieme');
  await presentazione(app.page).click();
  await attendi(async () => assert.equal(await presentazione(app.page).count(), 0));
  await attendi(async () => assert.equal(await attivi(), 3));
  // Uscita cambiando sezione a presentazione aperta: non resta nulla.
  await pulsante(app.page).click();
  await attendiFoto(app.page, 'tre.jpg');
  await app.vai('#/spesa');
  await attendi(async () => assert.equal(await attivi(), 0));
  assert.equal(await presentazione(app.page).count(), 0);
});

function senzaSchermoIntero() {
  delete Element.prototype.requestFullscreen;
  delete Element.prototype.webkitRequestFullscreen;
  delete Document.prototype.exitFullscreen;
  Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false, configurable: true });
  Object.defineProperty(Document.prototype, 'fullscreenElement', { get: () => null, configurable: true });
}

for (const viewport of ['tabletOrizzontale', 'smartphone']) {
  test('senza Fullscreen API la presentazione occupa tutta la finestra (' + viewport + ')', async ({ apri }) => {
    const app = await apri({ percorso: '#/foto', viewport, ora: ORA, oraFissa: true, scriptIniziale: senzaSchermoIntero });
    assert.equal(await app.page.evaluate(() => typeof document.body.requestFullscreen), 'undefined');
    await treFoto(app);
    await app.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await pulsante(app.page).click();
    await attendiFoto(app.page, 'tre.jpg');
    const finestra = await app.page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
    const box = await presentazione(app.page).boundingBox();
    assert.deepEqual([box.x, box.y, box.width, box.height], [0, 0, finestra.w, finestra.h]);
    // La foto sta dentro la finestra.
    const foto = await presentazione(app.page).getByRole('img').boundingBox();
    assert.ok(foto.width <= finestra.w && foto.height <= finestra.h);
    await app.avanzaOra(10000);
    await attendiFoto(app.page, 'due.jpg');
    await presentazione(app.page).click();
    await attendi(async () => assert.equal(await presentazione(app.page).count(), 0));
  });
}

test('con una sola foto la presentazione resta su quella, ed Esc la chiude', async ({ apri }) => {
  const app = await apri({ percorso: '#/foto', ora: ORA, oraFissa: true, scriptIniziale: img.tracciaUrl });
  const f = await img.crea(app.page, { larghezza: 400, altezza: 300, nome: 'sola.jpg' });
  await app.page.getByLabel('Aggiungi foto').setInputFiles(f);
  await attendi(async () => assert.equal(await pulsante(app.page).isVisible(), true));
  await pulsante(app.page).click();
  await attendiFoto(app.page, 'sola.jpg');
  await app.avanzaOra(30000);
  await attendiFoto(app.page, 'sola.jpg');
  assert.equal(await app.page.evaluate(() => window.__urlAttivi.size), 2); // miniatura + foto piena
  await app.page.keyboard.press('Escape');
  await attendi(async () => assert.equal(await presentazione(app.page).count(), 0));
  await attendi(async () => assert.equal(await app.page.evaluate(() => window.__urlAttivi.size), 1));
});

test('un tocco chiude la presentazione e torna alla galleria', async ({ apri }) => {
  const app = await apri({ percorso: '#/foto', viewport: 'smartphone', contesto: { hasTouch: true } });
  await treFoto(app);
  await pulsante(app.page).click();
  await attendiFoto(app.page, 'tre.jpg');
  await presentazione(app.page).tap();
  await attendi(async () => assert.equal(await presentazione(app.page).count(), 0));
  assert.match(app.page.url(), /#\/foto$/);
  assert.equal(await griglia(app.page).getByRole('button', { name: /^Apri / }).count(), 3);
  assert.equal(await pulsante(app.page).evaluate((b) => b === document.activeElement), true);
});

test('"indietro" chiude la presentazione e resta nella galleria', async ({ apri }) => {
  const app = await apri();
  await app.vai('#/foto');
  await treFoto(app);
  await pulsante(app.page).click();
  await attendiFoto(app.page, 'tre.jpg');
  await app.indietro();
  await attendi(async () => assert.equal(await presentazione(app.page).count(), 0));
  assert.match(app.page.url(), /#\/foto$/);
  assert.equal(await griglia(app.page).getByRole('button', { name: /^Apri / }).count(), 3);
  // Chiusa con un tocco, la voce di cronologia della presentazione sparisce: "indietro" lascia la galleria come sempre.
  await pulsante(app.page).click();
  await attendiFoto(app.page, 'tre.jpg');
  await presentazione(app.page).click();
  await attendi(async () => assert.equal(await presentazione(app.page).count(), 0));
  await app.indietro();
  await attendi(async () => assert.doesNotMatch(app.page.url(), /#\/foto$/));
});
