'use strict';
// API per i file di test. Ogni file in tests/ fa:
//   const { test, assert, attendi } = require('../lib/test');
//   test('descrizione', async ({ apri, sito }) => { const app = await apri({ percorso: '#/spesa' }); ... });

const assert = require('node:assert/strict');

const registro = [];
let fileCorrente = null;

/**
 * Registra un test.
 * opzioni: { timeout: ms (default 30000), solo: bool }
 * La funzione riceve il fixture { apri, sito, root, viewportPredefinito }.
 */
function test(nome, fn, opzioni) {
  registro.push({ nome: nome, fn: fn, file: fileCorrente, opzioni: opzioni || {} });
}

/** Viewport predefiniti (anche per --viewport del runner). */
const VIEWPORT = {
  tabletOrizzontale: { viewport: { width: 1024, height: 600 }, hasTouch: true },
  tabletVerticale: { viewport: { width: 600, height: 1024 }, hasTouch: true },
  smartphone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
  desktop: { viewport: { width: 1440, height: 900 }, hasTouch: false }
};

/**
 * Ripete fn finché non smette di lanciare eccezioni e non restituisce `false`.
 * Restituisce il valore di fn. Usare con assert dentro:
 *   await attendi(async () => assert.equal(await loc.count(), 2));
 */
async function attendi(fn, opzioni) {
  const o = opzioni || {};
  const scadenza = Date.now() + (o.timeout || 5000);
  let ultimo;
  for (;;) {
    try {
      const v = await fn();
      if (v !== false) return v;
      ultimo = new Error(o.messaggio || 'Condizione non verificata');
    } catch (e) {
      ultimo = e;
    }
    if (Date.now() > scadenza) {
      if (o.messaggio && ultimo && ultimo.message !== o.messaggio) ultimo.message = o.messaggio + ': ' + ultimo.message;
      throw ultimo;
    }
    await new Promise(function (r) { setTimeout(r, o.intervallo || 50); });
  }
}

/** Converte un orario locale di Roma 'AAAA-MM-GGTHH:MM[:SS]' in Date (istante assoluto). */
function oraRoma(testo) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(testo);
  if (!m) throw new Error('oraRoma: formato non valido ' + testo);
  const comp = m.slice(1).map(function (x) { return Number(x || 0); });
  const ingenuo = Date.UTC(comp[0], comp[1] - 1, comp[2], comp[3], comp[4], comp[5]);
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  function scarto(istante) {
    const p = {};
    fmt.formatToParts(new Date(istante)).forEach(function (x) { p[x.type] = Number(x.value); });
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - istante;
  }
  let t = ingenuo - scarto(ingenuo);
  t = ingenuo - scarto(t);
  return new Date(t);
}

module.exports = {
  test, assert, attendi, oraRoma, VIEWPORT,
  _registro: registro,
  _impostaFile: function (f) { fileCorrente = f; }
};
