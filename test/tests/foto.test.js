'use strict';
// Galleria foto (ticket #8): pagina Foto, vista ingrandita, scheda della dashboard e interfaccia CasaNostra.foto.
const { test, assert, attendi } = require('../lib/test');
const img = require('../lib/immagini');

function griglia(page) { return page.getByRole('list', { name: 'Foto' }); }
function miniature(page) { return griglia(page).getByRole('button', { name: /^Apri / }); }

async function aggiungi(page, file) {
  await page.getByLabel('Aggiungi foto').setInputFiles(file);
}

test('la galleria vuota mostra le istruzioni per aggiungere foto', async ({ apri }) => {
  const app = await apri({ percorso: '#/foto' });
  await attendi(async () => assert.match(await app.page.locator('main').textContent(), /Nessuna foto[\s\S]*Aggiungi foto/));
  const campo = app.page.getByLabel('Aggiungi foto');
  assert.equal(await campo.getAttribute('type'), 'file');
  assert.equal(await campo.getAttribute('accept'), 'image/*');
  assert.equal(await campo.getAttribute('multiple'), '');
});

test('una foto da 800×600 viene salvata senza modifiche e resta dopo il ricaricamento', async ({ apri }) => {
  const app = await apri({ percorso: '#/foto' });
  const originale = await img.crea(app.page, { larghezza: 800, altezza: 600, tipo: 'image/png', nome: 'piccola.png' });
  await aggiungi(app.page, originale);
  await attendi(async () => assert.equal(await miniature(app.page).count(), 1));
  await app.ricarica();
  await attendi(async () => assert.equal(await miniature(app.page).count(), 1));
  await miniature(app.page).first().click();
  const vista = app.page.getByRole('dialog', { name: 'piccola.png' });
  const dl = await app.scaricamento(() => vista.getByRole('button', { name: 'Scarica' }).click());
  assert.equal(dl.nome, 'piccola.png');
  assert.ok(dl.contenuto.equals(originale.buffer), 'il file scaricato è identico all\'originale');
});

test('una foto da 4000×3000 viene salvata con il lato lungo di 1200 px in JPEG', async ({ apri }) => {
  const app = await apri({ percorso: '#/foto' });
  const grande = await img.crea(app.page, { larghezza: 4000, altezza: 3000, tipo: 'image/png', nome: 'grande.png' });
  await aggiungi(app.page, grande);
  await attendi(async () => assert.equal(await miniature(app.page).count(), 1), { timeout: 15000 });
  await miniature(app.page).first().click();
  const vista = app.page.getByRole('dialog', { name: 'grande.jpg' });
  const piena = vista.getByRole('img', { name: 'grande.jpg' });
  await attendi(async () => assert.deepEqual(await piena.evaluate((i) => [i.naturalWidth, i.naturalHeight]), [1200, 900]));
  const dl = await app.scaricamento(() => vista.getByRole('button', { name: 'Scarica' }).click());
  assert.equal(dl.nome, 'grande.jpg');
  assert.equal(img.tipoDaiByte(dl.contenuto), 'image/jpeg');
  assert.deepEqual(await img.misura(app.page, dl.contenuto), { larghezza: 1200, altezza: 900 });
  // La miniatura della griglia è di circa 300 px sul lato lungo.
  const mini = miniature(app.page).first().locator('img');
  assert.deepEqual(await mini.evaluate((i) => [i.naturalWidth, i.naturalHeight]), [300, 225]);
}, { timeout: 40000 });

test('su 3 file, 1 corrotto e 1 non immagine, si aggiunge la foto valida e un messaggio elenca i 2 scartati', async ({ apri }) => {
  const app = await apri({ percorso: '#/foto' });
  const buona = await img.crea(app.page, { larghezza: 640, altezza: 480, nome: 'buona.jpg' });
  await aggiungi(app.page, [img.corrotta('rotta.jpg'), buona, img.testo('lista.txt')]);
  await attendi(async () => assert.equal(await miniature(app.page).count(), 1));
  assert.equal(await miniature(app.page).first().getAttribute('aria-label'), 'Apri buona.jpg');
  const messaggio = await app.page.getByRole('alert').filter({ hasText: 'non aggiunti' }).textContent();
  assert.match(messaggio, /2 file non aggiunti/);
  assert.match(messaggio, /rotta\.jpg/);
  assert.match(messaggio, /lista\.txt/);
  assert.doesNotMatch(messaggio, /buona\.jpg/);
});

test('un errore di quota mostra "spazio esaurito" e non lascia foto a metà', async ({ apri }) => {
  const app = await apri({ percorso: '#/foto', scriptIniziale: img.quotaEsaurita });
  const f = await img.crea(app.page, { larghezza: 640, altezza: 480, nome: 'a.jpg' });
  await aggiungi(app.page, f);
  await attendi(async () => assert.match((await app.page.getByRole('alert').allTextContents()).join(' '), /spazio esaurito/i));
  assert.equal(await miniature(app.page).count(), 0);
  assert.equal(await app.page.evaluate(() => CasaNostra.foto.conta()), 0);
  await app.ricarica();
  assert.equal(await miniature(app.page).count(), 0);
  assert.match(await app.page.locator('main').textContent(), /Nessuna foto/);
});

async function treFoto(app) {
  const files = [];
  for (const [nome, colore] of [['uno.jpg', '#ff0000'], ['due.jpg', '#00ff00'], ['tre.jpg', '#0000ff']]) {
    files.push(await img.crea(app.page, { larghezza: 400, altezza: 300, nome, colore }));
  }
  for (const f of files) {
    await aggiungi(app.page, f);
    await attendi(async () => assert.ok(await griglia(app.page).getByRole('button', { name: 'Apri ' + f.name }).count()));
  }
}

function etichette(page) {
  return miniature(page).evaluateAll((b) => b.map((x) => x.getAttribute('aria-label')));
}

test('la griglia mostra le miniature e la vista ingrandita scorre con precedente e successiva', async ({ apri }) => {
  const app = await apri({ percorso: '#/foto' });
  await treFoto(app);
  assert.deepEqual(await etichette(app.page), ['Apri tre.jpg', 'Apri due.jpg', 'Apri uno.jpg']); // dalla più recente
  await miniature(app.page).nth(1).click();
  const vista = app.page.getByRole('dialog');
  const titolo = () => vista.getByRole('heading').textContent();
  assert.equal(await titolo(), 'due.jpg');
  await attendi(async () => assert.equal(await vista.getByRole('img', { name: 'due.jpg' }).evaluate((i) => i.naturalWidth), 400));
  await vista.getByRole('button', { name: /Successiva/ }).click();
  await attendi(async () => assert.equal(await titolo(), 'uno.jpg'));
  await vista.getByRole('button', { name: /Successiva/ }).click();
  await attendi(async () => assert.equal(await titolo(), 'tre.jpg'));
  await vista.getByRole('button', { name: /Precedente/ }).click();
  await attendi(async () => assert.equal(await titolo(), 'uno.jpg'));
  await app.page.keyboard.press('Escape');
  await attendi(async () => assert.equal(await app.page.getByRole('dialog').count(), 0));
});

test('una foto si elimina solo dopo la conferma', async ({ apri }) => {
  const app = await apri({ percorso: '#/foto' });
  await treFoto(app);
  await griglia(app.page).getByRole('button', { name: 'Apri due.jpg' }).click();
  const vista = app.page.getByRole('dialog', { name: 'due.jpg' });
  await vista.getByRole('button', { name: 'Elimina' }).click();
  const conferma = app.page.getByRole('dialog', { name: 'Eliminare la foto?' });
  await conferma.getByRole('button', { name: 'Annulla' }).click();
  assert.equal(await app.page.evaluate(() => CasaNostra.foto.conta()), 3);
  await vista.getByRole('button', { name: 'Elimina' }).click();
  await conferma.getByRole('button', { name: 'Elimina' }).click();
  await attendi(async () => assert.equal(await miniature(app.page).count(), 2));
  await app.ricarica();
  assert.deepEqual(await etichette(app.page), ['Apri tre.jpg', 'Apri uno.jpg']);
});

test('gli URL temporanei si revocano chiudendo la vista e cambiando sezione', async ({ apri }) => {
  const app = await apri({ percorso: '#/foto', scriptIniziale: img.tracciaUrl });
  await treFoto(app);
  const attivi = () => app.page.evaluate(() => window.__urlAttivi.size);
  const vista = app.page.getByRole('dialog');
  await attendi(async () => assert.equal(await attivi(), 3));
  await miniature(app.page).first().click();
  await attendi(async () => assert.equal(await attivi(), 4));
  await vista.getByRole('button', { name: /Successiva/ }).click();
  await attendi(async () => assert.equal(await vista.getByRole('heading').textContent(), 'due.jpg'));
  await attendi(async () => assert.equal(await attivi(), 4));
  await vista.getByRole('button', { name: 'Chiudi', exact: true }).click();
  await attendi(async () => assert.equal(await attivi(), 3));
  await miniature(app.page).first().click();
  await attendi(async () => assert.equal(await attivi(), 4));
  await app.vai('#/spesa');
  await attendi(async () => assert.equal(await attivi(), 0));
  assert.equal(await app.page.getByRole('dialog').count(), 0);
  // Anche la scheda della dashboard rilascia il suo URL quando si lascia la Home.
  await app.vai('#/');
  await attendi(async () => assert.equal(await attivi(), 1));
  await app.vai('#/foto');
  await attendi(async () => assert.equal(await attivi(), 3));
});

test('la scheda della dashboard mostra il numero di foto e la miniatura dell\'ultima aggiunta', async ({ apri }) => {
  const app = await apri();
  const scheda = app.page.getByRole('region', { name: 'Foto' });
  assert.match(await scheda.textContent(), /Nessuna foto/);
  await app.vai('#/foto');
  await treFoto(app);
  await app.vai('#/');
  await attendi(async () => assert.match(await scheda.textContent(), /3 foto/));
  const ultima = scheda.getByRole('img', { name: /tre\.jpg/ });
  await attendi(async () => assert.equal(await ultima.evaluate((i) => i.complete && i.naturalWidth), 300));
  await scheda.getByRole('link', { name: /Vedi tutte \(3\)/ }).click();
  await app.attendiPronta();
  assert.match(app.page.url(), /#\/foto$/);
});

test('le foto non escono mai dal dispositivo', async ({ apri }) => {
  const app = await apri({ percorso: '#/foto' });
  const sospette = [];
  app.page.on('request', (r) => {
    const locale = r.url().startsWith(app.sito.origine) || /^(blob|data):/.test(r.url());
    if (r.method() !== 'GET' || !locale) sospette.push(r.method() + ' ' + r.url());
  });
  await treFoto(app);
  await miniature(app.page).first().click();
  await app.scaricamento(() => app.page.getByRole('dialog').getByRole('button', { name: 'Scarica' }).click());
  assert.deepEqual(sospette, []);
  assert.deepEqual(app.richiesteEsterne, []);
});

test('interfaccia per Presentazione e Archivio: foto elaborata con id dato e rigenerazione della miniatura', async ({ apri }) => {
  const app = await apri({ percorso: '#/foto' });
  const f = await img.crea(app.page, { larghezza: 900, altezza: 600, nome: 'archivio.jpg' });
  const r = await app.page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'image/jpeg' });
    const m = await CasaNostra.foto.aggiungiElaborata({ id: 'dall-archivio', nome: 'archivio.jpg', blob, aggiuntaIl: '2026-01-02T10:00:00.000Z' });
    const elenco = await CasaNostra.foto.elenco();
    const piena = await CasaNostra.foto.blobPieno('dall-archivio');
    const rigenerata = await CasaNostra.foto.rigeneraMiniatura('dall-archivio');
    const bmp = await createImageBitmap(rigenerata.miniatura);
    return {
      m: { id: m.id, larghezza: m.larghezza, altezza: m.altezza, haBlob: 'blob' in m },
      elenco: elenco.map((x) => [x.id, x.nome, x.aggiuntaIl, 'blob' in x]),
      stessiByte: piena.size === bytes.length,
      mini: [bmp.width, bmp.height]
    };
  }, f.buffer.toString('base64'));
  assert.deepEqual(r, {
    m: { id: 'dall-archivio', larghezza: 900, altezza: 600, haBlob: false },
    elenco: [['dall-archivio', 'archivio.jpg', '2026-01-02T10:00:00.000Z', false]],
    stessiByte: true,
    mini: [300, 200]
  });
  await app.ricarica();
  assert.deepEqual(await etichette(app.page), ['Apri archivio.jpg']);
});
