'use strict';
// Immagini di prova generate al volo (niente file nel repo). Dal ticket #8, riusabili da #9/#10.
//
//   const img = require('../lib/immagini');
//   const f = await img.crea(app.page, { larghezza: 4000, altezza: 3000, tipo: 'image/jpeg', nome: 'grande.jpg' });
//   await app.page.getByLabel('Aggiungi foto').setInputFiles([f, img.corrotta('rotta.jpg'), img.testo('nota.txt')]);
//   const { larghezza, altezza, tipo } = await img.misura(app.page, buffer);   // decodifica nel browser
//
// I file sono nel formato di Playwright setInputFiles: { name, mimeType, buffer }.

/**
 * Crea un'immagine con un canvas nel browser della pagina.
 * opzioni: { larghezza, altezza, tipo: 'image/jpeg'|'image/png'|'image/webp' (default jpeg), qualita, nome, colore }
 */
async function crea(page, opzioni) {
  const o = Object.assign({ larghezza: 800, altezza: 600, tipo: 'image/jpeg', qualita: 0.9, colore: '#7a9e7e' }, opzioni || {});
  const estensione = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[o.tipo] || 'img';
  const base64 = await page.evaluate(async function (o) {
    const canvas = new OffscreenCanvas(o.larghezza, o.altezza);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = o.colore;
    ctx.fillRect(0, 0, o.larghezza, o.altezza);
    ctx.fillStyle = '#c56b4a';
    ctx.fillRect(Math.floor(o.larghezza / 4), Math.floor(o.altezza / 4), Math.ceil(o.larghezza / 2), Math.ceil(o.altezza / 2));
    const blob = await canvas.convertToBlob({ type: o.tipo, quality: o.qualita });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, o);
  return { name: o.nome || ('foto-' + o.larghezza + 'x' + o.altezza + '.' + estensione), mimeType: o.tipo, buffer: Buffer.from(base64, 'base64') };
}

/** File con intestazione JPEG valida seguita da dati senza senso: il browser non riesce a decodificarlo. */
function corrotta(nome, tipo) {
  const testa = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
  const resto = Buffer.alloc(2000);
  for (let i = 0; i < resto.length; i++) resto[i] = (i * 31 + 7) % 251;
  return { name: nome || 'corrotta.jpg', mimeType: tipo || 'image/jpeg', buffer: Buffer.concat([testa, resto]) };
}

/** File di testo (non immagine). */
function testo(nome, contenuto) {
  return { name: nome || 'nota.txt', mimeType: 'text/plain', buffer: Buffer.from(contenuto || 'non sono una foto', 'utf8') };
}

/** Decodifica un'immagine (Buffer) nel browser e ne restituisce { larghezza, altezza }. */
async function misura(page, buffer, tipo) {
  return page.evaluate(async function (a) {
    const bytes = Uint8Array.from(atob(a.b64), function (c) { return c.charCodeAt(0); });
    const bmp = await createImageBitmap(new Blob([bytes], { type: a.tipo || '' }));
    const r = { larghezza: bmp.width, altezza: bmp.height };
    bmp.close();
    return r;
  }, { b64: buffer.toString('base64'), tipo: tipo });
}

/** Tipo del file dai primi byte: 'image/jpeg' | 'image/png' | 'image/webp' | null. */
function tipoDaiByte(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg';
  if (buffer[0] === 0x89 && buffer.toString('latin1', 1, 4) === 'PNG') return 'image/png';
  if (buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/**
 * scriptIniziale per apri(): tiene il conto degli URL blob: ancora attivi in window.__urlAttivi (Set).
 *   const app = await apri({ scriptIniziale: img.tracciaUrl });
 *   await app.page.evaluate(() => window.__urlAttivi.size)
 */
function tracciaUrl() {
  const crea = URL.createObjectURL.bind(URL);
  const revoca = URL.revokeObjectURL.bind(URL);
  window.__urlAttivi = new Set();
  URL.createObjectURL = function (o) { const u = crea(o); window.__urlAttivi.add(u); return u; };
  URL.revokeObjectURL = function (u) { window.__urlAttivi.delete(u); return revoca(u); };
}

/** scriptIniziale per apri(): ogni put nella raccolta IndexedDB "foto" fallisce con QuotaExceededError. */
function quotaEsaurita() {
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function () {
    if (this.name === 'foto') throw new DOMException('Quota simulata', 'QuotaExceededError');
    return put.apply(this, arguments);
  };
}

module.exports = { crea, corrotta, testo, misura, tipoDaiByte, tracciaUrl, quotaEsaurita };
