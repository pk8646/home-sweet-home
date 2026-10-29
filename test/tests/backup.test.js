'use strict';
// Backup dati, promemoria di backup e ripristino iniziale (ticket #11).
const { test, assert, attendi, oraRoma } = require('../lib/test');
const { senzaBenvenuto } = require('../lib/benvenuto');

const STRUTTURATE = ['prodotti', 'appuntamenti', 'attivita', 'promemoriaCasa', 'impostazioni'];

// ---------- dati di prova ----------

function datiDiProva() {
  return {
    prodotti: [
      { id: 'p1', nome: 'Latte', acquistato: false, creatoIl: '2026-03-01T08:00:00.000Z', acquistatoIl: null },
      { id: 'p2', nome: 'Pane', acquistato: true, creatoIl: '2026-03-01T08:01:00.000Z', acquistatoIl: '2026-03-02T09:00:00.000Z' }
    ],
    appuntamenti: [
      { id: 'a1', titolo: 'Dentista', data: '2026-03-12', ora: '15:30', note: 'Portare la tessera', creatoIl: '2026-03-01T08:00:00.000Z' },
      { id: 'a2', titolo: 'Compleanno nonna', data: '2026-04-02', ora: '', note: '', creatoIl: '2026-03-01T08:02:00.000Z' },
      { id: 'a3', titolo: 'Riunione scuola', data: '2026-03-20', ora: '17:00', note: '', creatoIl: '2026-03-01T08:03:00.000Z' }
    ],
    attivita: [
      { id: 't1', titolo: 'Chiamare l\'idraulico', nota: '', completata: false, creataIl: '2026-03-01T08:00:00.000Z', completataIl: null }
    ],
    promemoriaCasa: [
      { id: 'c1', titolo: 'Cambiare il filtro', categoria: 'manutenzione', data: '2026-03-15', note: '', intervalloGiorni: 90,
        completato: false, ultimoCompletamento: '2025-12-15', creatoIl: '2026-01-01T08:00:00.000Z' },
      { id: 'c2', titolo: 'Bollo auto', categoria: 'scadenza', data: null, note: 'Online', intervalloGiorni: null,
        completato: true, ultimoCompletamento: null, creatoIl: '2026-01-02T08:00:00.000Z' }
    ],
    impostazioni: [
      { id: 'impostazioni', nomeVisualizzato: 'Famiglia Rossi', localita: { nome: 'Roma', latitudine: 41.9, longitudine: 12.5 },
        schedeVisibili: { meteo: false }, schermoAcceso: false, ultimoBackup: null, benvenutoVisto: true, avvisoBackupPosticipatoFino: null }
    ]
  };
}

/** Scrive dati e (facoltativamente) foto direttamente nella persistenza dell'app, poi ricarica. */
async function semina(app, dati, opzioni) {
  const o = opzioni || {};
  await app.page.evaluate(async function (arg) {
    if (Object.keys(arg.dati).length) await window.CasaNostra.db.replaceAll(arg.dati);
    for (let i = 0; i < arg.foto; i++) {
      const c = new OffscreenCanvas(40, 30);
      const ctx = c.getContext('2d');
      ctx.fillStyle = i ? '#c56b4a' : '#7a9e7e';
      ctx.fillRect(0, 0, 40, 30);
      const blob = await c.convertToBlob({ type: 'image/png' });
      await window.CasaNostra.foto.aggiungiElaborata({ id: 'f' + i, nome: 'foto' + i + '.png', blob: blob });
    }
  }, { dati: dati, foto: o.foto || 0 });
  await app.ricarica();
}

/** Contenuto attuale: le raccolte strutturate ordinate per id e i metadati delle foto. */
function istantanea(page) {
  return page.evaluate(async function (nomi) {
    const r = {};
    for (const n of nomi) {
      r[n] = (await window.CasaNostra.db.raccolta(n).list()).sort((a, b) => a.id < b.id ? -1 : 1);
    }
    r.foto = (await window.CasaNostra.db.raccolta('foto').list())
      .map((f) => ({ id: f.id, nome: f.nome, dimensione: f.blob && f.blob.size, miniatura: !!f.miniatura }))
      .sort((a, b) => a.id < b.id ? -1 : 1);
    return r;
  }, STRUTTURATE);
}

function gruppoBackup(page) { return page.getByRole('region', { name: 'Backup dati' }); }
function gruppoRipristino(page) { return page.getByRole('region', { name: 'Ripristino iniziale' }); }
function avvisoBackup(page) { return page.getByRole('region', { name: 'Promemoria backup' }); }

function esporta(app) {
  return app.scaricamento(() => gruppoBackup(app.page).getByRole('button', { name: 'Esporta il backup dati' }).click());
}

function fileJson(contenuto, nome) {
  const testo = typeof contenuto === 'string' ? contenuto : JSON.stringify(contenuto);
  return { name: nome || 'backup.json', mimeType: 'application/json', buffer: Buffer.from(testo, 'utf8') };
}

async function scegliBackup(app, file) {
  await gruppoBackup(app.page).getByLabel('Importa un backup dati').setInputFiles(file);
}

function backupValido(modifica) {
  const b = { app: 'casa-nostra', schemaVersion: 1, esportatoIl: '2026-03-05T10:00:00.000Z', dati: datiDiProva() };
  if (modifica) modifica(b);
  return b;
}

async function ripristina(app) {
  await gruppoRipristino(app.page).getByRole('button', { name: 'Cancella tutto' }).click();
  const dialogo = app.page.getByRole('dialog');
  await dialogo.getByLabel('Per confermare scrivi CANCELLA').fill('CANCELLA');
  await dialogo.getByRole('button', { name: 'Cancella tutto' }).click();
  // L'app si ricarica da sola e torna alla dashboard del primo avvio.
  await attendi(async () => assert.equal(await app.page.getByRole('region', { name: 'Benvenuti' }).count(), 1), { timeout: 10000 });
  await app.attendiPronta();
}

// ---------- esportazione ----------

test('il file esportato contiene tutte le raccolte strutturate, schemaVersion 1 e nessuna foto', async ({ apri }) => {
  const app = await apri({ percorso: '#/impostazioni', ora: '2026-03-05T10:00', oraFissa: true });
  await semina(app, datiDiProva(), { foto: 2 });
  assert.match(await gruppoBackup(app.page).textContent(), /non contiene le foto[\s\S]*archivio foto/i);
  const dl = await esporta(app);
  assert.equal(dl.nome, 'casa-nostra-backup-2026-03-05.json');
  const b = JSON.parse(dl.testo);
  assert.equal(b.app, 'casa-nostra');
  assert.equal(b.schemaVersion, 1);
  assert.equal(b.esportatoIl, new Date(oraRoma('2026-03-05T10:00')).toISOString());
  assert.deepEqual(Object.keys(b.dati).sort(), STRUTTURATE.slice().sort());
  assert.ok(!/foto0|foto1|"foto"\s*:/.test(dl.testo), 'nessuna foto nel backup');
  const attesi = datiDiProva();
  for (const n of ['prodotti', 'appuntamenti', 'attivita', 'promemoriaCasa']) {
    assert.deepEqual(b.dati[n].slice().sort((x, y) => x.id < y.id ? -1 : 1), attesi[n], n);
  }
  assert.equal(b.dati.impostazioni.length, 1);
  assert.equal(b.dati.impostazioni[0].nomeVisualizzato, 'Famiglia Rossi');
});

test('"Ultimo backup" dice "mai", poi "oggi" dopo l\'esportazione, e "N giorni fa" col passare del tempo', async ({ apri }) => {
  const app = await apri({ percorso: '#/impostazioni', ora: '2026-03-05T10:00', oraFissa: true });
  await attendi(async () => assert.match(await gruppoBackup(app.page).textContent(), /Ultimo backup: mai/));
  await esporta(app);
  await attendi(async () => assert.match(await gruppoBackup(app.page).textContent(), /Ultimo backup: oggi/));
  await app.orologio.setSystemTime(oraRoma('2026-03-17T09:00'));
  await app.ricarica();
  await attendi(async () => assert.match(await gruppoBackup(app.page).textContent(), /Ultimo backup: 12 giorni fa/));
});

// ---------- andata e ritorno ----------

test('andata e ritorno: esporta → ripristino iniziale → importa → dati e impostazioni identici', async ({ apri }) => {
  const app = await apri({ percorso: '#/impostazioni', ora: '2026-03-05T10:00' });
  await semina(app, datiDiProva());
  const dl = await esporta(app);
  await attendi(async () => assert.match(await gruppoBackup(app.page).textContent(), /Ultimo backup: oggi/));
  const prima = await istantanea(app.page);

  await ripristina(app);
  const vuoto = await istantanea(app.page);
  for (const n of STRUTTURATE.concat('foto')) assert.deepEqual(vuoto[n], [], n + ' vuota dopo il ripristino');

  await app.vai('#/impostazioni');
  await scegliBackup(app, fileJson(dl.testo, dl.nome));
  const dialogo = app.page.getByRole('dialog');
  await dialogo.getByRole('button', { name: 'Importa' }).click();
  await attendi(async () => assert.deepEqual(await istantanea(app.page), prima));
  await attendi(async () => assert.equal(await app.page.getByRole('banner').getByRole('heading', { level: 1 }).textContent(), 'Famiglia Rossi'));
  await app.vai('#/spesa');
  assert.match(await app.page.locator('main').textContent(), /Latte/);
});

test('il riepilogo mostra data del backup e conteggi giusti; annullare non cambia nulla', async ({ apri }) => {
  const app = await apri({ percorso: '#/impostazioni', scriptIniziale: senzaBenvenuto });
  const attuali = { prodotti: [{ id: 'x1', nome: 'Uova', acquistato: false, creatoIl: '2026-02-01T08:00:00.000Z', acquistatoIl: null }] };
  await semina(app, attuali);
  const prima = await istantanea(app.page);
  await scegliBackup(app, fileJson(backupValido()));
  const dialogo = app.page.getByRole('dialog');
  const testo = await dialogo.textContent();
  assert.match(testo, /05\/03\/2026/);
  assert.match(testo, /2 prodotti/);
  assert.match(testo, /3 appuntamenti/);
  assert.match(testo, /1 attività/);
  assert.match(testo, /2 promemoria casa/);
  assert.match(testo, /foto non vengono toccate/i);
  await dialogo.getByRole('button', { name: 'Annulla' }).click();
  await attendi(async () => assert.equal(await app.page.getByRole('dialog').count(), 0));
  assert.deepEqual(await istantanea(app.page), prima);
});

test('importare un backup non modifica le foto', async ({ apri }) => {
  const app = await apri({ percorso: '#/impostazioni', scriptIniziale: senzaBenvenuto });
  await semina(app, {}, { foto: 2 });
  const prima = await istantanea(app.page);
  assert.equal(prima.foto.length, 2);
  await scegliBackup(app, fileJson(backupValido()));
  await app.page.getByRole('dialog').getByRole('button', { name: 'Importa' }).click();
  await attendi(async () => assert.equal((await istantanea(app.page)).prodotti.length, 2));
  assert.deepEqual((await istantanea(app.page)).foto, prima.foto);
});

// ---------- file non validi: rifiutati senza toccare i dati ----------

const NON_VALIDI = [
  ['JSON malformato', () => '{"app":"casa-nostra", "schemaVersion": 1, "dati": {', /non è un file JSON leggibile/],
  ['app sbagliata', () => backupValido((b) => { b.app = 'altra-app'; }), /non è un backup dati di Casa Nostra/],
  ['schemaVersion futura', () => backupValido((b) => { b.schemaVersion = 2; }), /versione più recente di Casa Nostra/],
  ['raccolta che non è un elenco', () => backupValido((b) => { b.dati.attivita = { t1: {} }; }), /«Attività» non è un elenco/],
  ['campo obbligatorio mancante', () => backupValido((b) => { delete b.dati.prodotti[1].nome; }),
    /«Prodotti», elemento 2 \(id «p2»\): manca il campo «nome»/],
  ['tipo sbagliato', () => backupValido((b) => { b.dati.attivita[0].completata = 'no'; }),
    /«Attività», elemento 1 \(id «t1»\): il campo «completata» deve essere vero o falso/],
  ['data non valida', () => backupValido((b) => { b.dati.appuntamenti[2].data = '2026-02-30'; }),
    /«Appuntamenti», elemento 3 \(id «a3»\): il campo «data» non è una data valida/],
  ['id duplicati', () => backupValido((b) => { b.dati.promemoriaCasa[1].id = 'c1'; }),
    /«Promemoria casa», elemento 2 \(id «c1»\): l'identificativo è già usato dall'elemento 1/]
];

for (const [nome, crea, messaggio] of NON_VALIDI) {
  test('backup rifiutato (' + nome + '): messaggio specifico e dati attuali identici', async ({ apri }) => {
    const app = await apri({ percorso: '#/impostazioni', scriptIniziale: senzaBenvenuto });
    await semina(app, { prodotti: [{ id: 'x1', nome: 'Uova', acquistato: false, creatoIl: '2026-02-01T08:00:00.000Z', acquistatoIl: null }] }, { foto: 1 });
    const prima = await istantanea(app.page);
    await scegliBackup(app, fileJson(crea()));
    const errore = gruppoBackup(app.page).getByRole('alert');
    await attendi(async () => assert.match(await errore.textContent(), messaggio));
    assert.equal(await app.page.getByRole('dialog').count(), 0, 'nessuna conferma per un file non valido');
    assert.deepEqual(await istantanea(app.page), prima);
  });
}

// Senza benvenuto, e con window.__guasto = true la scrittura nella raccolta 'attivita' fallisce
// (durante l'importazione arriva dopo aver già svuotato e riscritto prodotti e appuntamenti).
function guastoAttivita() {
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function () {
    if (window.__guasto && this.name === 'attivita') throw new DOMException('Spazio finito', 'QuotaExceededError');
    return put.apply(this, arguments);
  };
}
const senzaBenvenutoConGuasto = '(' + senzaBenvenuto + ')();(' + guastoAttivita + ')();';

test('un errore a metà della transazione di importazione lascia i dati attuali identici', async ({ apri }) => {
  const app = await apri({ percorso: '#/impostazioni', scriptIniziale: senzaBenvenutoConGuasto });
  await semina(app, {
    prodotti: [{ id: 'x1', nome: 'Uova', acquistato: false, creatoIl: '2026-02-01T08:00:00.000Z', acquistatoIl: null }],
    attivita: [{ id: 'y1', titolo: 'Stirare', nota: '', completata: false, creataIl: '2026-02-01T08:00:00.000Z', completataIl: null }]
  }, { foto: 1 });
  const prima = await istantanea(app.page);
  await app.page.evaluate(() => { window.__guasto = true; });
  await scegliBackup(app, fileJson(backupValido()));
  await app.page.getByRole('dialog').getByRole('button', { name: 'Importa' }).click();
  await attendi(async () => assert.match(await app.page.locator('body').textContent(), /Spazio esaurito/));
  await app.page.evaluate(() => { window.__guasto = false; });
  assert.deepEqual(await istantanea(app.page), prima);
  await app.vai('#/spesa');
  assert.match(await app.page.locator('main').textContent(), /Uova/);
});

// ---------- promemoria di backup sulla dashboard ----------

test('senza dati l\'avviso di backup non compare; con dati e nessun backup sì', async ({ apri }) => {
  const app = await apri({ scriptIniziale: senzaBenvenuto });
  await app.page.getByRole('region', { name: 'Spesa' }).waitFor();
  assert.equal(await avvisoBackup(app.page).count(), 0);
  await semina(app, { attivita: datiDiProva().attivita });
  await attendi(async () => assert.match(await avvisoBackup(app.page).textContent(), /non hai ancora fatto un backup/i));
});

test('l\'avviso compare dopo più di 30 giorni dall\'ultimo backup e chiuderlo lo nasconde per 7 giorni', async ({ apri }) => {
  const app = await apri({ percorso: '#/impostazioni', ora: '2026-03-05T10:00', oraFissa: true, scriptIniziale: senzaBenvenuto });
  await semina(app, { prodotti: datiDiProva().prodotti });
  await esporta(app);
  await attendi(async () => assert.match(await gruppoBackup(app.page).textContent(), /Ultimo backup: oggi/));
  await app.vai('#/');
  await app.page.getByRole('region', { name: 'Spesa' }).waitFor();
  assert.equal(await avvisoBackup(app.page).count(), 0, 'appena fatto il backup');

  const a = async (quando) => { await app.orologio.setSystemTime(oraRoma(quando)); await app.ricarica(); await app.page.getByRole('region', { name: 'Spesa' }).waitFor(); };
  await a('2026-04-04T10:00'); // 30 giorni
  assert.equal(await avvisoBackup(app.page).count(), 0, 'a 30 giorni non compare');
  await a('2026-04-05T10:00'); // 31 giorni
  await attendi(async () => assert.match(await avvisoBackup(app.page).textContent(), /31 giorni/));
  await avvisoBackup(app.page).getByRole('button', { name: 'Ricordamelo fra 7 giorni' }).click();
  await attendi(async () => assert.equal(await avvisoBackup(app.page).count(), 0));
  await a('2026-04-11T10:00'); // 6 giorni dopo
  assert.equal(await avvisoBackup(app.page).count(), 0, 'ancora nascosto dopo 6 giorni');
  await a('2026-04-12T10:00'); // 7 giorni dopo
  await attendi(async () => assert.equal(await avvisoBackup(app.page).count(), 1));
  await avvisoBackup(app.page).getByRole('link', { name: 'Fai il backup' }).click();
  await app.attendiPronta();
  assert.match(app.page.url(), /#\/impostazioni$/);
});

// ---------- ripristino iniziale ----------

test('il ripristino iniziale non parte senza CANCELLA esatto; poi cancella dati, impostazioni, foto e copia del meteo', async ({ apri }) => {
  const app = await apri({ percorso: '#/impostazioni' });
  await semina(app, datiDiProva(), { foto: 2 });
  await app.page.evaluate(() => localStorage.setItem('casaNostra.meteo.copia', '{"x":1}'));
  const prima = await istantanea(app.page);

  await gruppoRipristino(app.page).getByRole('button', { name: 'Cancella tutto' }).click();
  const dialogo = app.page.getByRole('dialog');
  assert.match(await dialogo.textContent(), /backup/i);
  const conferma = dialogo.getByRole('button', { name: 'Cancella tutto' });
  const campo = dialogo.getByLabel('Per confermare scrivi CANCELLA');
  for (const sbagliato of ['', 'cancella', 'CANCEL', 'CANCELLA!']) {
    await campo.fill(sbagliato);
    assert.equal(await conferma.isDisabled(), true, '"' + sbagliato + '" non abilita la conferma');
  }
  await campo.press('Enter');
  await dialogo.getByRole('button', { name: 'Annulla' }).click();
  await attendi(async () => assert.equal(await app.page.getByRole('dialog').count(), 0));
  assert.deepEqual(await istantanea(app.page), prima);

  await ripristina(app);
  const dopo = await istantanea(app.page);
  for (const n of STRUTTURATE.concat('foto')) assert.deepEqual(dopo[n], [], n);
  assert.equal(await app.page.evaluate(() => localStorage.getItem('casaNostra.meteo.copia')), null);
  assert.match(app.page.url(), /#\/$/);
  assert.equal(await app.page.getByRole('banner').getByRole('heading', { level: 1 }).textContent(), 'Casa Nostra');
});
