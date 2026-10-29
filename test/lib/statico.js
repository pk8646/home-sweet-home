'use strict';
// Controlli statici sui file del sito: sintassi JS e risorse referenziate.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ESCLUSE = new Set(['node_modules']);
// cartelle della radice che non sono parte dell'app: test/ è la suite stessa (esclusa da Pages in _config.yml)
const ESCLUSE_IN_RADICE = new Set(['test']);

/** Tutti i file sotto root con una delle estensioni date (percorsi relativi con '/'), escluse cartelle nascoste e test/. */
function elencaFile(root, estensioni) {
  const risultato = [];
  (function giro(dir) {
    for (const voce of fs.readdirSync(dir, { withFileTypes: true })) {
      if (voce.name.startsWith('.') || ESCLUSE.has(voce.name)) continue;
      if (dir === root && ESCLUSE_IN_RADICE.has(voce.name)) continue;
      const completo = path.join(dir, voce.name);
      if (voce.isDirectory()) giro(completo);
      else if (estensioni.includes(path.extname(voce.name).toLowerCase())) {
        risultato.push(path.relative(root, completo).split(path.sep).join('/'));
      }
    }
  })(root);
  return risultato.sort();
}

/** Errori di sintassi di ogni script JS: [{ file, errore }]. Il codice viene solo analizzato, non eseguito. */
function controllaSintassi(root) {
  const errori = [];
  for (const f of elencaFile(root, ['.js'])) {
    try {
      new vm.Script(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
    } catch (e) {
      errori.push({ file: f, errore: e.message });
    }
  }
  return errori;
}

/** Riferimenti locali (src/href) in un file HTML, nell'ordine in cui compaiono. */
function riferimentiHtml(root, fileHtml) {
  const html = fs.readFileSync(path.join(root, fileHtml), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const rif = [];
  const re = /<(script|link|img|a|source|iframe)\b[^>]*?\s(src|href)\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const url = m[3];
    if (/^(https?:|data:|mailto:|tel:|blob:|#|javascript:)/i.test(url)) continue;
    const rel = (/\srel\s*=\s*["']([^"']+)["']/i.exec(tag) || [])[1] || '';
    rif.push({ tag: m[1].toLowerCase(), attributo: m[2], url: url, rel: rel, da: fileHtml });
  }
  return rif;
}

function risolvi(daFile, url) {
  const pulito = url.split('#')[0].split('?')[0];
  return path.posix.normalize(path.posix.join(path.posix.dirname(daFile), pulito));
}

/**
 * Controlla che ogni risorsa referenziata in index.html (e nel manifest, se collegato) esista
 * e che i percorsi siano relativi. Restituisce [{ da, url, problema }].
 */
function controllaRisorse(root) {
  const problemi = [];
  const verifica = function (da, url) {
    if (url.startsWith('/')) { problemi.push({ da: da, url: url, problema: 'percorso assoluto (usare un percorso relativo)' }); return null; }
    const f = risolvi(da, url);
    if (f === '.' || f === '') return f;
    if (!fs.existsSync(path.join(root, f))) problemi.push({ da: da, url: url, problema: 'file inesistente' });
    return f;
  };
  for (const r of riferimentiHtml(root, 'index.html')) {
    if (r.tag === 'a') continue;
    const f = verifica('index.html', r.url);
    if (f && r.rel === 'manifest' && fs.existsSync(path.join(root, f))) {
      let manifest;
      try { manifest = JSON.parse(fs.readFileSync(path.join(root, f), 'utf8')); } catch (e) {
        problemi.push({ da: f, url: f, problema: 'manifest non è JSON valido: ' + e.message });
        continue;
      }
      (manifest.icons || []).forEach(function (ic) { verifica(f, ic.src); });
      ['start_url', 'scope'].forEach(function (k) { if (manifest[k]) verifica(f, manifest[k]); });
    }
  }
  return problemi;
}

/** File .js e .css del sito che index.html non carica (probabile tag dimenticato). sw.js è escluso. */
function fileNonInclusi(root) {
  const inclusi = new Set(riferimentiHtml(root, 'index.html').map(function (r) { return risolvi('index.html', r.url); }));
  return elencaFile(root, ['.js', '.css']).filter(function (f) { return f !== 'sw.js' && !inclusi.has(f); });
}

module.exports = { elencaFile, controllaSintassi, riferimentiHtml, controllaRisorse, fileNonInclusi };
