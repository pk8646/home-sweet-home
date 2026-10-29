'use strict';
// Runner dei test di Casa Nostra.
//
//   node run.js --root <cartella-del-sito> [file-o-nome ...] [--grep testo] [--viewport nome] [--paralleli N] [--headed]
//
// - la root si può dare anche con la variabile d'ambiente CASA_NOSTRA_ROOT (default: cartella corrente)
// - senza file vengono eseguiti tutti i tests/**/*.test.js; "spesa" equivale a tests/spesa.test.js
// - --viewport cambia il viewport predefinito di apri() (tabletOrizzontale, tabletVerticale, smartphone, desktop)
// - ogni esecuzione usa una porta libera casuale: più runner possono girare in parallelo

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const { avviaServer } = require('./server');
const libTest = require('./lib/test');
const { creaApri } = require('./lib/app');

const CHROME = process.env.CASA_NOSTRA_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CARTELLA_TEST = path.join(__dirname, 'tests');

function leggiArgomenti(argv) {
  const a = { file: [], paralleli: 4, headed: false, grep: null, viewport: null, root: process.env.CASA_NOSTRA_ROOT || process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--root') a.root = argv[++i];
    else if (x === '--grep') a.grep = argv[++i];
    else if (x === '--viewport') a.viewport = argv[++i];
    else if (x === '--paralleli') a.paralleli = Math.max(1, Number(argv[++i]) || 1);
    else if (x === '--headed') a.headed = true;
    else a.file.push(x);
  }
  return a;
}

function tuttiIFile(dir) {
  const r = [];
  for (const v of fs.readdirSync(dir, { withFileTypes: true })) {
    const c = path.join(dir, v.name);
    if (v.isDirectory()) r.push.apply(r, tuttiIFile(c));
    else if (v.name.endsWith('.test.js')) r.push(c);
  }
  return r.sort();
}

function risolviFile(nome) {
  const candidati = [nome, path.join(CARTELLA_TEST, nome), path.join(CARTELLA_TEST, nome + '.test.js'), path.join(CARTELLA_TEST, nome + '.js')];
  for (const c of candidati) if (fs.existsSync(c) && fs.statSync(c).isFile()) return path.resolve(c);
  throw new Error('File di test non trovato: ' + nome);
}

function conTimeout(promessa, ms) {
  let t;
  return Promise.race([
    promessa,
    new Promise(function (_, rifiuta) { t = setTimeout(function () { rifiuta(new Error('Timeout del test dopo ' + ms + ' ms')); }, ms); })
  ]).finally(function () { clearTimeout(t); });
}

async function main() {
  const arg = leggiArgomenti(process.argv.slice(2));
  const root = path.resolve(arg.root);
  if (!fs.existsSync(path.join(root, 'index.html'))) {
    console.error('index.html non trovato in ' + root + ' (usa --root <cartella> o CASA_NOSTRA_ROOT)');
    process.exit(2);
  }
  const files = arg.file.length ? arg.file.map(risolviFile) : tuttiIFile(CARTELLA_TEST);
  for (const f of files) {
    libTest._impostaFile(path.relative(__dirname, f));
    require(f);
  }
  let tests = libTest._registro.slice();
  if (tests.some(function (t) { return t.opzioni.solo; })) tests = tests.filter(function (t) { return t.opzioni.solo; });
  if (arg.grep) tests = tests.filter(function (t) { return t.nome.toLowerCase().includes(arg.grep.toLowerCase()); });

  const sito = await avviaServer(root, 0);
  const browser = await chromium.launch({ executablePath: CHROME, headless: !arg.headed });
  console.log('Sito: ' + root + '\nURL:  ' + sito.url + '\nTest: ' + tests.length + (arg.viewport ? ' (viewport ' + arg.viewport + ')' : '') + '\n');

  const esiti = [];
  let indice = 0;
  async function lavoratore() {
    while (indice < tests.length) {
      const t = tests[indice++];
      const apri = creaApri(browser, sito, { viewportPredefinito: arg.viewport });
      const inizio = Date.now();
      let errore = null;
      try {
        await conTimeout(Promise.resolve().then(function () {
          return t.fn({ apri: apri, sito: sito, root: root, viewportPredefinito: arg.viewport });
        }), t.opzioni.timeout || 30000);
        for (const app of apri._aperte) {
          const nonGestiti = app.erroriNonGestiti();
          if (nonGestiti.length) {
            throw new Error('Errori non gestiti in console:\n  ' + nonGestiti.map(function (e) { return '[' + e.tipo + '] ' + e.testo; }).join('\n  '));
          }
        }
      } catch (e) {
        errore = e;
      }
      for (const app of apri._aperte) await app.contesto.close().catch(function () {});
      const durata = Date.now() - inizio;
      esiti.push({ t: t, errore: errore });
      if (errore) console.log('  ✗ ' + t.file + ' › ' + t.nome + ' (' + durata + ' ms)\n      ' + String(errore.stack || errore).split('\n').join('\n      '));
      else console.log('  ✓ ' + t.file + ' › ' + t.nome + ' (' + durata + ' ms)');
    }
  }
  const lavoratori = [];
  for (let i = 0; i < Math.min(arg.paralleli, tests.length); i++) lavoratori.push(lavoratore());
  await Promise.all(lavoratori);

  await browser.close();
  await sito.chiudi();
  const falliti = esiti.filter(function (e) { return e.errore; });
  console.log('\nPassati: ' + (esiti.length - falliti.length) + '  Falliti: ' + falliti.length);
  if (falliti.length) {
    console.log('Falliti:');
    falliti.forEach(function (e) { console.log('  - ' + e.t.file + ' › ' + e.t.nome); });
  }
  process.exit(falliti.length || !esiti.length ? 1 : 0);
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
