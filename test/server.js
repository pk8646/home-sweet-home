'use strict';
// Server statico minimale: serve la cartella `root` sotto il sottopercorso /home-sweet-home/,
// come GitHub Pages. Uso da riga di comando:
//   node test/server.js [root-del-sito] [porta]
// root assente = CASA_NOSTRA_ROOT o la radice del repository; porta 0 o assente = porta libera casuale

const http = require('http');
const fs = require('fs');
const path = require('path');

const SOTTOPERCORSO = '/home-sweet-home/';

const TIPI = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

function rispondi(res, stato, corpo, intestazioni) {
  res.writeHead(stato, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' }, intestazioni || {}));
  res.end(corpo);
}

function creaServer(root) {
  const radice = path.resolve(root);
  return http.createServer(function (req, res) {
    let percorso;
    try {
      percorso = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch (e) {
      return rispondi(res, 400, 'Richiesta non valida');
    }
    if (percorso === '/' || percorso === SOTTOPERCORSO.slice(0, -1)) {
      return rispondi(res, 301, '', { Location: SOTTOPERCORSO });
    }
    if (!percorso.startsWith(SOTTOPERCORSO)) return rispondi(res, 404, 'Fuori dal sottopercorso');
    const relativo = percorso.slice(SOTTOPERCORSO.length);
    // niente file nascosti (.git, .claude, ...) e niente uscite dalla radice
    if (relativo.split('/').some(function (p) { return p.startsWith('.'); })) return rispondi(res, 404, 'Non trovato');
    let file = path.resolve(radice, relativo);
    if (file !== radice && !file.startsWith(radice + path.sep)) return rispondi(res, 403, 'Vietato');
    fs.stat(file, function (err, st) {
      if (!err && st.isDirectory()) {
        if (!percorso.endsWith('/')) return rispondi(res, 301, '', { Location: percorso + '/' });
        file = path.join(file, 'index.html');
      }
      fs.readFile(file, function (err2, dati) {
        if (err2) return rispondi(res, 404, 'Non trovato: ' + percorso);
        const tipo = TIPI[path.extname(file).toLowerCase()] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': tipo, 'Cache-Control': 'no-cache' });
        res.end(req.method === 'HEAD' ? undefined : dati);
      });
    });
  });
}

/** Avvia il server; restituisce { url, porta, chiudi() }. Porta 0 = libera casuale. */
function avviaServer(root, porta) {
  const server = creaServer(root);
  return new Promise(function (risolvi, rifiuta) {
    server.once('error', rifiuta);
    server.listen(porta || 0, '127.0.0.1', function () {
      const p = server.address().port;
      risolvi({
        porta: p,
        origine: 'http://127.0.0.1:' + p,
        url: 'http://127.0.0.1:' + p + SOTTOPERCORSO,
        chiudi: function () {
          return new Promise(function (r) { server.closeAllConnections && server.closeAllConnections(); server.close(function () { r(); }); });
        }
      });
    });
  });
}

module.exports = { avviaServer, SOTTOPERCORSO };

if (require.main === module) {
  const root = process.argv[2] || process.env.CASA_NOSTRA_ROOT || path.resolve(__dirname, '..');
  avviaServer(root, Number(process.argv[3]) || 0).then(function (s) {
    console.log('Casa Nostra servita da ' + path.resolve(root) + ' su ' + s.url);
  });
}
