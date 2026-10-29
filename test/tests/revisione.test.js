'use strict';
// Correzioni della code review di casa-nostra-v1: comportamenti richiesti dalla spec (issue #1)
// che la prima versione non rispettava. Si agisce come un utente; i confini esterni sono simulati.
const fs = require('fs');
const path = require('path');
const { test, assert, attendi } = require('../lib/test');
const { senzaBenvenuto } = require('../lib/benvenuto');
const { meteoFinto } = require('../lib/meteo-finto');
const img = require('../lib/immagini');

function fileJson(oggetto) {
  return { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(oggetto), 'utf8') };
}

function backupConPromemoria(promemoria) {
  return {
    app: 'casa-nostra', schemaVersion: 1, esportatoIl: '2026-03-05T10:00:00.000Z',
    dati: { prodotti: [], appuntamenti: [], attivita: [], promemoriaCasa: promemoria, impostazioni: [] }
  };
}

function gruppoBackup(page) { return page.getByRole('region', { name: 'Backup dati' }); }

// ---------- a. promemoria casa: campo intervalloGiorni come da spec ----------

test('un backup conforme alla spec con intervalloGiorni mantiene la ricorrenza del promemoria casa', async ({ apri }) => {
  const app = await apri({ percorso: '#/impostazioni', ora: '2026-03-05T10:00', scriptIniziale: senzaBenvenuto });
  await gruppoBackup(app.page).getByLabel('Importa un backup dati').setInputFiles(fileJson(backupConPromemoria([
    { id: 'c1', titolo: 'Cambiare il filtro', categoria: 'manutenzione', data: '2026-03-10', note: '', intervalloGiorni: 30,
      completato: false, ultimoCompletamento: null, creatoIl: '2026-01-01T08:00:00.000Z' }
  ])));
  await app.page.getByRole('dialog').getByRole('button', { name: 'Importa' }).click();
  await attendi(async () => assert.equal(await app.page.getByRole('dialog').count(), 0));
  await app.vai('#/casa');
  const main = app.page.getByRole('main');
  await attendi(async () => assert.match(await main.textContent(), /Ogni 30 giorni/));
  await main.getByRole('button', { name: 'Completa Cambiare il filtro' }).click();
  await attendi(async () => assert.match(await main.textContent(), /09\/04\/2026/));
  assert.match(await main.textContent(), /Ogni 30 giorni/);
});

test('il backup esportato scrive la ricorrenza in intervalloGiorni e rifiuta un intervalloGiorni non valido', async ({ apri }) => {
  const app = await apri({ percorso: '#/casa', scriptIniziale: senzaBenvenuto });
  await app.page.getByRole('button', { name: 'Nuovo promemoria' }).click();
  const d = app.page.getByRole('dialog');
  await d.getByLabel('Titolo', { exact: true }).fill('Pulizia grondaie');
  await d.getByLabel(/^Ripeti ogni/).fill('90');
  await d.getByRole('button', { name: 'Salva' }).click();
  await attendi(async () => assert.match(await app.page.getByRole('main').textContent(), /Ogni 90 giorni/));
  await app.vai('#/impostazioni');
  const dl = await app.scaricamento(() => gruppoBackup(app.page).getByRole('button', { name: 'Esporta il backup dati' }).click());
  const p = JSON.parse(dl.testo).dati.promemoriaCasa[0];
  assert.equal(p.intervalloGiorni, 90);
  assert.ok(!('intervallo' in p), 'nessun campo «intervallo»');

  await gruppoBackup(app.page).getByLabel('Importa un backup dati').setInputFiles(fileJson(JSON.parse(dl.testo.replace('"intervalloGiorni": 90', '"intervalloGiorni": 0'))));
  await attendi(async () => assert.match(await gruppoBackup(app.page).getByRole('alert').textContent(), /il campo «intervalloGiorni» deve essere un numero intero/));
});

// ---------- b. meteo: nessun polling, timer di 30 minuti solo con la pagina visibile ----------

/** scriptIniziale: registra i setInterval e i setTimeout lunghi (≥ 10 minuti) ancora in attesa. */
function tracciaTimer() {
  const si = window.setInterval;
  const st = window.setTimeout;
  const ct = window.clearTimeout;
  window.__intervalli = [];
  window.__lunghi = new Set();
  window.setInterval = function (fn, ms) { window.__intervalli.push(ms); return si.apply(window, arguments); };
  window.setTimeout = function (fn, ms) {
    if (!(ms >= 10 * 60 * 1000)) return st.apply(window, arguments);
    let id = null;
    const avvolta = function () { window.__lunghi.delete(id); return typeof fn === 'function' ? fn.apply(this, arguments) : undefined; };
    id = st.call(window, avvolta, ms);
    window.__lunghi.add(id);
    return id;
  };
  window.clearTimeout = function (id) { window.__lunghi.delete(id); return ct.apply(window, arguments); };
}

async function impostaVisibilita(page, stato) {
  await page.evaluate(function (s) {
    Object.defineProperty(document, 'visibilityState', { value: s, configurable: true });
    Object.defineProperty(document, 'hidden', { value: s === 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, stato);
}

test('il meteo non fa polling: nessun setInterval, e il timer di 30 minuti esiste solo con la pagina visibile', async ({ apri }) => {
  const app = await apri({ ora: '2026-10-28T09:05', rete: [meteoFinto()], scriptIniziale: tracciaTimer });
  const scheda = app.page.getByRole('region', { name: 'Meteo' });
  await attendi(async () => assert.match(await scheda.textContent(), /agg\. 09:05/));
  await app.avanzaOra(5 * 60 * 1000);
  assert.deepEqual(await app.page.evaluate(() => window.__intervalli), [], 'nessun setInterval');
  await attendi(async () => assert.equal(await app.page.evaluate(() => window.__lunghi.size), 1), { messaggio: 'un timer di 30 minuti con la pagina visibile' });
  await impostaVisibilita(app.page, 'hidden');
  await attendi(async () => assert.equal(await app.page.evaluate(() => window.__lunghi.size), 0), { messaggio: 'nessun timer con la pagina nascosta' });
  await impostaVisibilita(app.page, 'visible');
  await attendi(async () => assert.equal(await app.page.evaluate(() => window.__lunghi.size), 1));
  await app.vai('#/spesa');
  await attendi(async () => assert.equal(await app.page.evaluate(() => window.__lunghi.size), 0), { messaggio: 'lasciata la dashboard il timer si ferma' });
});

// ---------- c. LocalStorage contiene solo la copia del meteo ----------

test('LocalStorage contiene una sola chiave, la copia del meteo, anche dopo un aggiornamento a mano', async ({ apri }) => {
  const app = await apri({ ora: '2026-10-28T09:05', rete: [meteoFinto()] });
  const scheda = app.page.getByRole('region', { name: 'Meteo' });
  await attendi(async () => assert.match(await scheda.textContent(), /agg\. 09:05/));
  await app.avanzaOra(61 * 1000);
  const pulsante = scheda.getByRole('button', { name: 'Aggiorna' });
  await attendi(async () => assert.equal(await pulsante.isDisabled(), false));
  await pulsante.click();
  await attendi(async () => assert.equal(await pulsante.isDisabled(), true));
  await attendi(async () => assert.match(await scheda.textContent(), /agg\. 09:06/));
  assert.deepEqual(await app.page.evaluate(() => Object.keys(localStorage)), ['casaNostra.meteo.copia']);
});

// ---------- d. CANCELLA esatto ----------

test('il ripristino iniziale non accetta CANCELLA con spazi prima o dopo', async ({ apri }) => {
  const app = await apri({ percorso: '#/impostazioni', scriptIniziale: senzaBenvenuto });
  await app.page.getByRole('region', { name: 'Ripristino iniziale' }).getByRole('button', { name: 'Cancella tutto' }).click();
  const dialogo = app.page.getByRole('dialog');
  const campo = dialogo.getByLabel('Per confermare scrivi CANCELLA');
  const conferma = dialogo.getByRole('button', { name: 'Cancella tutto' });
  for (const sbagliato of [' CANCELLA', 'CANCELLA ', ' CANCELLA ']) {
    await campo.fill(sbagliato);
    assert.equal(await conferma.isDisabled(), true, '"' + sbagliato + '" non abilita la conferma');
    await campo.press('Enter');
    assert.equal(await dialogo.count(), 1, '"' + sbagliato + '" + Invio non conferma');
  }
  await campo.fill('CANCELLA');
  assert.equal(await conferma.isDisabled(), false);
  await dialogo.getByRole('button', { name: 'Annulla' }).click();
});

// ---------- e. archiviazione persistente al primo salvataggio di qualunque dato ----------

function tracciaPersist() {
  window.__persist = 0;
  const finto = {
    persisted: function () { return Promise.resolve(false); },
    persist: function () { window.__persist++; return Promise.resolve(true); },
    estimate: function () { return Promise.resolve({ quota: 1e9, usage: 0 }); }
  };
  Object.defineProperty(navigator, 'storage', { value: finto, configurable: true });
}

test('al primo salvataggio di un prodotto si chiede l\'archiviazione persistente, una sola volta per sessione', async ({ apri }) => {
  const app = await apri({ percorso: '#/spesa', scriptIniziale: tracciaPersist });
  assert.equal(await app.page.evaluate(() => window.__persist), 0, 'aprire l\'app non salva nulla');
  for (const nome of ['Latte', 'Pane']) {
    await app.page.getByLabel('Prodotto da aggiungere').fill(nome);
    await app.page.getByRole('button', { name: 'Aggiungi', exact: true }).click();
    await attendi(async () => assert.match(await app.page.getByRole('main').textContent(), new RegExp(nome)));
  }
  await attendi(async () => assert.equal(await app.page.evaluate(() => window.__persist), 1));
  await app.vai('#/attivita');
  await app.page.getByLabel('Nuova attività', { exact: true }).fill('Stirare');
  await app.page.getByRole('button', { name: 'Aggiungi', exact: true }).click();
  await attendi(async () => assert.match(await app.page.getByRole('main').textContent(), /Stirare/));
  assert.equal(await app.page.evaluate(() => window.__persist), 1);
});

test('senza navigator.storage i dati si salvano comunque', async ({ apri }) => {
  const app = await apri({
    percorso: '#/spesa',
    scriptIniziale: function () { Object.defineProperty(navigator, 'storage', { value: undefined, configurable: true }); }
  });
  await app.page.getByLabel('Prodotto da aggiungere').fill('Uova');
  await app.page.getByRole('button', { name: 'Aggiungi', exact: true }).click();
  await app.ricarica();
  await attendi(async () => assert.match(await app.page.getByRole('main').textContent(), /Uova/));
});

// ---------- f. miniature: URL temporanei solo per quelle sullo schermo ----------

async function seminaFoto(app, quante) {
  await app.page.evaluate(async function (n) {
    for (let i = 0; i < n; i++) {
      const c = new OffscreenCanvas(60, 40);
      const ctx = c.getContext('2d');
      ctx.fillStyle = 'hsl(' + (i * 37 % 360) + ',60%,50%)';
      ctx.fillRect(0, 0, 60, 40);
      const blob = await c.convertToBlob({ type: 'image/png' });
      await window.CasaNostra.foto.aggiungiElaborata({ id: 'f' + String(i).padStart(3, '0'), nome: 'foto' + i + '.png', blob: blob,
        aggiuntaIl: new Date(Date.UTC(2026, 0, 1, 0, 0, n - i)).toISOString() });
    }
  }, quante);
}

test('la galleria crea l\'URL di una miniatura quando entra nello schermo e lo revoca quando ne esce', async ({ apri }) => {
  const QUANTE = 60;
  const app = await apri({ percorso: '#/foto', viewport: 'smartphone', scriptIniziale: img.tracciaUrl });
  await seminaFoto(app, QUANTE);
  await app.ricarica();
  const miniature = app.page.getByRole('list', { name: 'Foto' }).getByRole('button');
  await attendi(async () => assert.equal(await miniature.count(), QUANTE));
  const attivi = () => app.page.evaluate(() => window.__urlAttivi.size);
  const caricata = (i) => miniature.nth(i).locator('img').evaluate((el) => el.complete && el.naturalWidth > 0 && el.src.startsWith('blob:'));
  await attendi(async () => assert.equal(await caricata(0), true));
  await attendi(async () => {
    const n = await attivi();
    assert.ok(n > 0 && n < QUANTE / 2, 'solo le miniature vicine allo schermo hanno un URL (' + n + ')');
  });
  await miniature.nth(QUANTE - 1).scrollIntoViewIfNeeded();
  await attendi(async () => assert.equal(await caricata(QUANTE - 1), true));
  await attendi(async () => assert.equal(await miniature.nth(0).locator('img').evaluate((el) => el.hasAttribute('src')), false),
    { messaggio: 'la prima miniatura, uscita dallo schermo, ha rilasciato il suo URL' });
  assert.ok(await attivi() < QUANTE / 2);
  await miniature.nth(0).scrollIntoViewIfNeeded();
  await attendi(async () => assert.equal(await caricata(0), true));
  await app.vai('#/spesa');
  await attendi(async () => assert.equal(await attivi(), 0));
}, { timeout: 60000 });

// ---------- g. nessun interruttore di test nel codice dell'app ----------

function fileJs(cartella) {
  return fs.readdirSync(cartella, { withFileTypes: true }).flatMap(function (v) {
    const p = path.join(cartella, v.name);
    if (v.isDirectory()) return fileJs(p);
    return v.name.endsWith('.js') ? [p] : [];
  });
}

test('il codice dell\'app non contiene globali pensati per i test', async ({ root }) => {
  const file = fileJs(path.join(root, 'js')).concat([path.join(root, 'sw.js')]);
  const colpevoli = file.filter((f) => /CasaNostraSenzaBenvenuto/.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(colpevoli, []);
});

test('l\'helper senzaBenvenuto toglie il benvenuto anche dopo il ricaricamento, senza toccare gli altri dati', async ({ apri }) => {
  const app = await apri({ percorso: '#/spesa', scriptIniziale: senzaBenvenuto });
  await app.page.getByLabel('Prodotto da aggiungere').fill('Caffè');
  await app.page.getByRole('button', { name: 'Aggiungi', exact: true }).click();
  await attendi(async () => assert.match(await app.page.getByRole('main').textContent(), /Caffè/));
  await app.vai('#/');
  await app.page.getByRole('region', { name: 'Spesa' }).waitFor();
  assert.equal(await app.page.getByRole('region', { name: 'Benvenuti' }).count(), 0);
  await app.ricarica();
  await app.page.getByRole('region', { name: 'Spesa' }).waitFor();
  assert.equal(await app.page.getByRole('region', { name: 'Benvenuti' }).count(), 0);
  assert.match(await app.page.getByRole('region', { name: 'Spesa' }).textContent(), /Caffè/);
});
