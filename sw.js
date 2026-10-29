/*
 * Service Worker di Casa Nostra (ticket #12).
 * Pre-cache delle risorse statiche; per la stessa origine prova prima la rete (timeout breve), poi la cache.
 * Le richieste ad altre origini (es. Open-Meteo) non vengono intercettate.
 *
 * Chi aggiunge un file a index.html (o un'icona al manifest) lo aggiunge anche a RISORSE: il test di coerenza
 * fallisce se le due liste divergono. VERSIONE si aumenta solo al rilascio, non nei singoli ticket.
 */
'use strict';

var VERSIONE = '1';
var PREFISSO = 'casa-nostra-';
var NOME_CACHE = PREFISSO + VERSIONE;
var TIMEOUT_RETE_MS = 3000;

var RISORSE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icone/icona.svg',
  'icone/icona-192.png',
  'icone/icona-512.png',
  'icone/icona-maskable-192.png',
  'icone/icona-maskable-512.png',

  'css/base.css',
  'css/layout.css',
  'css/componenti.css',
  'css/sezioni/dashboard.css',
  'css/sezioni/spesa.css',
  'css/sezioni/agenda.css',
  'css/sezioni/attivita.css',
  'css/sezioni/casa.css',
  'css/sezioni/meteo.css',
  'css/sezioni/foto.css',
  'css/presentazione.css',
  'css/sezioni/impostazioni.css',

  'js/casanostra.js',
  'js/date.js',
  'js/db.js',
  'js/errori.js',
  'js/ui.js',
  'js/dialoghi.js',
  'js/impostazioni.js',
  'js/dominio/spesa.js',
  'js/dominio/agenda.js',
  'js/dominio/attivita.js',
  'js/dominio/casa.js',
  'js/meteo.js',
  'js/foto.js',
  'js/presentazione.js',
  'js/backup.js',
  'js/pwa.js',
  'js/sezioni/dashboard.js',
  'js/sezioni/spesa.js',
  'js/sezioni/agenda.js',
  'js/sezioni/attivita.js',
  'js/sezioni/casa.js',
  'js/sezioni/meteo.js',
  'js/sezioni/foto.js',
  'js/sezioni/impostazioni.js',
  'js/avvio.js'
];

self.addEventListener('install', function (evento) {
  evento.waitUntil(caches.open(NOME_CACHE).then(function (cache) {
    // cache: 'reload' evita copie vecchie dalla cache HTTP del browser
    return cache.addAll(RISORSE.map(function (u) { return new Request(u, { cache: 'reload' }); }));
  }).then(function () {
    return self.skipWaiting();
  }));
});

self.addEventListener('activate', function (evento) {
  // Elimina solo le cache dell'app con versione diversa: IndexedDB e LocalStorage non si toccano.
  evento.waitUntil(caches.keys().then(function (nomi) {
    return Promise.all(nomi.filter(function (nome) {
      return nome.indexOf(PREFISSO) === 0 && nome !== NOME_CACHE;
    }).map(function (nome) { return caches.delete(nome); }));
  }).then(function () {
    return self.clients.claim();
  }));
});

/** Rete con timeout breve; se la rete non risponde in tempo o fallisce, la copia in cache. */
function primaLaRete(richiesta, evento) {
  var daCache = function () {
    return caches.match(richiesta, { ignoreSearch: true }).then(function (r) {
      if (r || richiesta.mode !== 'navigate') return r;
      return caches.match('./');
    });
  };
  var rete = fetch(richiesta).then(function (risposta) {
    if (risposta && risposta.ok && risposta.type === 'basic') {
      var copia = risposta.clone();
      evento.waitUntil(caches.open(NOME_CACHE).then(function (cache) {
        return cache.put(richiesta, copia);
      }).catch(function () { /* quota o cache non disponibile: la risposta va comunque alla pagina */ }));
    }
    return risposta;
  });
  return new Promise(function (risolvi, rifiuta) {
    var finito = false;
    var ripiego = function () {
      if (finito) return;
      daCache().then(function (r) {
        if (r && !finito) { finito = true; risolvi(r); }
      });
    };
    var timer = setTimeout(ripiego, TIMEOUT_RETE_MS);
    rete.then(function (r) {
      clearTimeout(timer);
      if (!finito) { finito = true; risolvi(r); }
    }, function (errore) {
      clearTimeout(timer);
      daCache().then(function (r) {
        if (finito) return;
        finito = true;
        if (r) risolvi(r); else rifiuta(errore);
      });
    });
  });
}

self.addEventListener('fetch', function (evento) {
  var richiesta = evento.request;
  if (richiesta.method !== 'GET') return;
  // Altre origini (Open-Meteo, ...): il Service Worker non interviene.
  if (new URL(richiesta.url).origin !== self.location.origin) return;
  evento.respondWith(primaLaRete(richiesta, evento));
});
