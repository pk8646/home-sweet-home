'use strict';
// Archivio foto (ticket #10): esportazione in ZIP STORE e reimportazione dalle Impostazioni.
// Lo ZIP scaricato viene riletto qui con un lettore indipendente (zlib di Node per CRC32 e DEFLATE)
// e, se presente, con `tar` del sistema (bsdtar legge gli ZIP) come strumento standard.
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const { test, assert, attendi } = require('../lib/test');
const img = require('../lib/immagini');

// ---------- lettore e scrittore ZIP minimi, indipendenti dall'app ----------

/** Legge uno ZIP (solo STORE/DEFLATE) dalla directory centrale: [{ nome, metodo, flag, dati: Buffer, crcOk }]. */
function leggiZip(buf) {
  let fine = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { fine = i; break; }
  }
  assert.ok(fine >= 0, 'manca la fine della directory centrale');
  const quante = buf.readUInt16LE(fine + 10);
  let p = buf.readUInt32LE(fine + 16);
  const voci = [];
  for (let n = 0; n < quante; n++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50, 'intestazione centrale');
    const flag = buf.readUInt16LE(p + 8);
    const metodo = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const compressa = buf.readUInt32LE(p + 20);
    const lNome = buf.readUInt16LE(p + 28);
    const lExtra = buf.readUInt16LE(p + 30);
    const lCommento = buf.readUInt16LE(p + 32);
    const locale = buf.readUInt32LE(p + 42);
    const nome = buf.toString('utf8', p + 46, p + 46 + lNome);
    assert.equal(buf.readUInt32LE(locale), 0x04034b50, 'intestazione locale di ' + nome);
    const inizio = locale + 30 + buf.readUInt16LE(locale + 26) + buf.readUInt16LE(locale + 28);
    const grezzi = buf.subarray(inizio, inizio + compressa);
    const dati = metodo === 8 ? zlib.inflateRawSync(grezzi) : Buffer.from(grezzi);
    voci.push({ nome, metodo, flag, dati, crcOk: zlib.crc32(dati) === crc });
    p += 46 + lNome + lExtra + lCommento;
  }
  return voci;
}

/** Scrive uno ZIP con le voci { nome, dati } e il metodo dato (0 STORE, 8 DEFLATE). */
function scriviZip(voci, metodo) {
  const locali = [];
  const centrali = [];
  let offset = 0;
  for (const v of voci) {
    const nome = Buffer.from(v.nome, 'utf8');
    const dati = Buffer.isBuffer(v.dati) ? v.dati : Buffer.from(v.dati, 'utf8');
    const corpo = metodo === 8 ? zlib.deflateRawSync(dati) : dati;
    const crc = zlib.crc32(dati);
    const l = Buffer.alloc(30);
    l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(0x0800, 6); l.writeUInt16LE(metodo, 8);
    l.writeUInt32LE(crc, 14); l.writeUInt32LE(corpo.length, 18); l.writeUInt32LE(dati.length, 22); l.writeUInt16LE(nome.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(metodo, 10);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(corpo.length, 20); c.writeUInt32LE(dati.length, 24); c.writeUInt16LE(nome.length, 28);
    c.writeUInt32LE(offset, 42);
    locali.push(l, nome, corpo);
    centrali.push(c, nome);
    offset += 30 + nome.length + corpo.length;
  }
  const dir = Buffer.concat(centrali);
  const e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(voci.length, 8); e.writeUInt16LE(voci.length, 10);
  e.writeUInt32LE(dir.length, 12); e.writeUInt32LE(offset, 16);
  return Buffer.concat([...locali, dir, e]);
}

/** Elenco dei file con `tar -tf` del sistema, o null se non disponibile. */
function elencoConTar(buf) {
  const file = path.join(os.tmpdir(), 'casa-nostra-archivio-' + process.pid + '-' + Date.now() + '.zip');
  fs.writeFileSync(file, buf);
  try {
    return execFileSync('tar', ['-tf', file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split(/\r?\n/).filter(Boolean);
  } catch (e) {
    return null;
  } finally {
    fs.unlinkSync(file);
  }
}

// ---------- azioni dell'utente ----------

function gruppo(page) { return page.getByRole('region', { name: 'Archivio foto' }); }

async function aggiungiFoto(app, specifiche) {
  await vaiA(app, '#/foto');
  for (const s of specifiche) {
    const f = await img.crea(app.page, Object.assign({ larghezza: 400, altezza: 300 }, s));
    await app.page.getByLabel('Aggiungi foto').setInputFiles(f);
    await attendi(async () => assert.ok(await app.page.getByRole('button', { name: 'Apri ' + s.nome }).count()));
  }
}

const TRE = [
  { nome: 'mare.jpg', colore: '#3366cc' },
  { nome: 'compleanno di Zoë.png', tipo: 'image/png', colore: '#cc3366' },
  { nome: 'giardino.jpg', colore: '#33cc66' }
];

/** Va alla pagina se non ci si trova già (cambiare hash verso lo stesso valore non ridisegna). */
async function vaiA(app, hash) {
  if (!app.page.url().endsWith(hash)) await app.vai(hash);
}

async function esporta(app) {
  await vaiA(app, '#/impostazioni');
  return app.scaricamento(() => gruppo(app.page).getByRole('button', { name: 'Esporta archivio foto' }).click());
}

async function importa(app, file) {
  await vaiA(app, '#/impostazioni');
  await gruppo(app.page).getByLabel('Importa archivio foto').setInputFiles(file);
}

function fotoSalvate(page) {
  return page.evaluate(async () => (await CasaNostra.foto.elenco())
    .map((f) => ({ id: f.id, nome: f.nome, aggiuntaIl: f.aggiuntaIl, tipo: f.tipo }))
    .sort((a, b) => (a.id < b.id ? -1 : 1)));
}

function eliminaTutte(page) {
  return page.evaluate(async () => {
    for (const f of await CasaNostra.foto.elenco()) await CasaNostra.foto.elimina(f.id);
  });
}

function zipFile(dl) { return { name: dl.nome, mimeType: 'application/zip', buffer: dl.contenuto }; }

// ---------- test ----------

test('l\'esportazione produce uno ZIP STORE standard con le foto e l\'indice, senza miniature', async ({ apri }) => {
  const app = await apri({ ora: '2026-05-04T10:00' });
  await aggiungiFoto(app, TRE);
  const salvate = await fotoSalvate(app.page);
  const dl = await esporta(app);
  assert.equal(dl.nome, 'casa-nostra-foto-2026-05-04.zip');

  const voci = leggiZip(dl.contenuto);
  assert.ok(voci.every((v) => v.metodo === 0), 'tutte le voci sono STORE');
  assert.ok(voci.every((v) => v.crcOk), 'CRC32 corretto per ogni voce');
  assert.ok(voci.every((v) => (v.flag & 0x0800) !== 0), 'nomi segnati come UTF-8');
  assert.equal(voci.length, 4, 'tre foto più l\'indice, nessuna miniatura');

  const indice = JSON.parse(voci.find((v) => v.nome === 'casa-nostra-foto.json').dati.toString('utf8'));
  assert.equal(indice.app, 'casa-nostra');
  assert.equal(indice.schemaVersion, 1);
  assert.equal(indice.foto.length, 3);
  assert.deepEqual(indice.foto.map((f) => ({ id: f.id, nome: f.nome, aggiuntaIl: f.aggiuntaIl, tipo: f.tipo }))
    .sort((a, b) => (a.id < b.id ? -1 : 1)), salvate);
  for (const f of indice.foto) {
    const voce = voci.find((v) => v.nome === f.file);
    assert.ok(voce, 'il file ' + f.file + ' è nell\'archivio');
    assert.equal(img.tipoDaiByte(voce.dati), f.tipo);
    const pieno = await app.page.evaluate(async (id) => (await CasaNostra.foto.blobPieno(id)).size, f.id);
    assert.equal(voce.dati.length, pieno, 'la foto elaborata è salvata intera');
  }
  assert.ok(indice.foto.some((f) => f.file.includes('Zoë')), 'il nome UTF-8 resta leggibile');

  const conTar = elencoConTar(dl.contenuto);
  if (conTar) {
    // tar stampa i nomi nella codifica della console: si confrontano numero di voci e nomi ASCII.
    assert.equal(conTar.length, voci.length);
    const ascii = (l) => l.filter((n) => /^[\x20-\x7e]+$/.test(n)).sort();
    assert.deepEqual(ascii(conTar), ascii(voci.map((v) => v.nome)));
  }
}, { timeout: 30000 });

function resoconto(page) { return gruppo(page).getByRole('status'); }

test('andata e ritorno: esporta, elimina tutte le foto, importa e ritrovi le stesse foto', async ({ apri }) => {
  const app = await apri();
  await aggiungiFoto(app, TRE);
  const prima = await fotoSalvate(app.page);
  const dl = await esporta(app);
  await eliminaTutte(app.page);
  assert.equal(await app.page.evaluate(() => CasaNostra.foto.conta()), 0);

  await importa(app, zipFile(dl));
  await attendi(async () => assert.match(await resoconto(app.page).textContent(), /Importate 3, già presenti 0, non leggibili 0/));
  assert.deepEqual(await fotoSalvate(app.page), prima);

  // Le miniature sono state rigenerate e la galleria le mostra anche dopo il ricaricamento.
  await app.vai('#/foto');
  await app.ricarica();
  const etichette = await app.page.getByRole('list', { name: 'Foto' }).getByRole('button', { name: /^Apri / })
    .evaluateAll((b) => b.map((x) => x.getAttribute('aria-label')));
  assert.deepEqual(etichette.sort(), TRE.map((s) => 'Apri ' + s.nome).sort());
  const mini = await app.page.evaluate(async () => {
    const f = (await CasaNostra.foto.elenco())[0];
    const bmp = await createImageBitmap(f.miniatura);
    return Math.max(bmp.width, bmp.height);
  });
  assert.equal(mini, 300);
}, { timeout: 30000 });

test('importare due volte lo stesso archivio non crea doppioni', async ({ apri }) => {
  const app = await apri();
  await aggiungiFoto(app, TRE.slice(0, 2));
  const dl = await esporta(app);
  await importa(app, zipFile(dl));
  await attendi(async () => assert.match(await resoconto(app.page).textContent(), /Importate 0, già presenti 2, non leggibili 0/));
  await aggiungiFoto(app, [TRE[2]]);
  await importa(app, zipFile(dl));
  await attendi(async () => assert.match(await resoconto(app.page).textContent(), /Importate 0, già presenti 2, non leggibili 0/));
  assert.equal(await app.page.evaluate(() => CasaNostra.foto.conta()), 3, 'nessun doppione e nessuna foto eliminata');
}, { timeout: 30000 });

function avviso(page) { return gruppo(page).getByRole('alert'); }

test('uno ZIP compresso, uno di un\'altra app o un file non ZIP vengono rifiutati senza modifiche', async ({ apri }) => {
  const app = await apri();
  await aggiungiFoto(app, TRE.slice(0, 2));
  const prima = await fotoSalvate(app.page);
  const foto = await img.crea(app.page, { larghezza: 200, altezza: 100, nome: 'esterna.jpg' });
  const indice = (appId) => JSON.stringify({
    app: appId, schemaVersion: 1,
    foto: [{ id: 'esterna', nome: 'esterna.jpg', aggiuntaIl: '2026-01-01T00:00:00.000Z', tipo: 'image/jpeg', file: 'foto/esterna.jpg' }]
  });
  const voci = (appId) => [{ nome: 'casa-nostra-foto.json', dati: indice(appId) }, { nome: 'foto/esterna.jpg', dati: foto.buffer }];
  const zip = (nome, buffer) => ({ name: nome, mimeType: 'application/zip', buffer });
  const casi = [
    [zip('compresso.zip', scriviZip(voci('casa-nostra'), 8)), /compresso o creato da un altro programma/],
    [zip('altra-app.zip', scriviZip(voci('altra-app'), 0)), /non è un archivio foto di Casa Nostra/],
    [zip('futuro.zip', scriviZip([{ nome: 'casa-nostra-foto.json', dati: JSON.stringify({ app: 'casa-nostra', schemaVersion: 99, foto: [] }) }], 0)), /versione più recente/],
    [img.testo('appunti.zip', 'non sono uno zip'), /non è un archivio foto di Casa Nostra/],
    [foto, /non è un archivio foto di Casa Nostra/]
  ];
  for (const [file, messaggio] of casi) {
    await vaiA(app, '#/foto');
    await importa(app, file);
    await attendi(async () => assert.match(await avviso(app.page).textContent(), messaggio));
    assert.match(await avviso(app.page).textContent(), /Nessuna foto è stata modificata/);
    assert.equal(await resoconto(app.page).count(), 0);
    assert.deepEqual(await fotoSalvate(app.page), prima, file.name + ' non modifica le foto');
  }
  // Lo stesso contenuto, in STORE e con l'app giusta, viene invece importato: il rifiuto dipende solo dal difetto.
  await vaiA(app, '#/foto');
  await importa(app, zip('buono.zip', scriviZip(voci('casa-nostra'), 0)));
  await attendi(async () => assert.match(await resoconto(app.page).textContent(), /Importate 1, già presenti 0, non leggibili 0/));
}, { timeout: 40000 });

test('una voce danneggiata è contata come non leggibile e le altre vengono importate', async ({ apri }) => {
  const app = await apri();
  await aggiungiFoto(app, TRE);
  const dl = await esporta(app);
  await eliminaTutte(app.page);
  const vittima = leggiZip(dl.contenuto).find((v) => v.nome.includes('giardino'));
  const rotto = Buffer.from(dl.contenuto);
  rotto[rotto.indexOf(vittima.dati) + Math.floor(vittima.dati.length / 2)] ^= 0xff;
  await importa(app, { name: dl.nome, mimeType: 'application/zip', buffer: rotto });
  await attendi(async () => assert.match(await resoconto(app.page).textContent(), /Importate 2, già presenti 0, non leggibili 1/));
  assert.deepEqual((await fotoSalvate(app.page)).map((f) => f.nome).sort(), ['compleanno di Zoë.png', 'mare.jpg']);
}, { timeout: 30000 });

test('un errore di memoria durante l\'esportazione suggerisce di scaricare le foto una per una', async ({ apri }) => {
  const app = await apri();
  await aggiungiFoto(app, TRE.slice(0, 2));
  await app.vai('#/impostazioni');
  // Leggere le foto in memoria fallisce come in Chrome quando la RAM non basta.
  await app.page.evaluate(() => {
    Blob.prototype.arrayBuffer = function () { return Promise.reject(new RangeError('Array buffer allocation failed')); };
  });
  let scaricati = 0;
  app.page.on('download', () => { scaricati++; });
  await gruppo(app.page).getByRole('button', { name: 'Esporta archivio foto' }).click();
  await attendi(async () => assert.match(await avviso(app.page).textContent(), /Memoria insufficiente[\s\S]*foto una per una/));
  assert.equal(scaricati, 0);
  assert.equal(await app.page.evaluate(() => CasaNostra.foto.conta()), 2);
});
