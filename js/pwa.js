/*
 * CasaNostra.pwa — PWA: registrazione del Service Worker (sw.js) e avviso di nuova versione.
 * La registrazione avviene dopo il primo disegno, solo se supportata e in contesto sicuro;
 * un eventuale fallimento viene solo registrato in console (l'app funziona comunque).
 * Se la pagina era già controllata da un Service Worker e ne arriva uno nuovo (sw.js con un'altra
 * VERSIONE), compare il toast "Nuova versione disponibile" con il pulsante "Ricarica".
 */
(function (CasaNostra) {
  'use strict';

  var avvisoMostrato = false;

  function mostraNuovaVersione() {
    if (avvisoMostrato) return;
    avvisoMostrato = true;
    CasaNostra.ui.toast('Nuova versione disponibile', {
      tipo: 'info',
      durataMs: 60000,
      azione: { testo: 'Ricarica', esegui: function () { location.reload(); } }
    });
  }

  /** navigator.serviceWorker se utilizzabile qui, altrimenti null. */
  function contenitore() {
    try {
      return window.isSecureContext && navigator.serviceWorker ? navigator.serviceWorker : null;
    } catch (e) {
      return null;
    }
  }

  function osservaNuoveVersioni(sw) {
    // Alla prima installazione il controller passa da nessuno a sw.js: non è una nuova versione.
    var giaControllata = !!sw.controller;
    sw.addEventListener('controllerchange', function () {
      if (giaControllata) mostraNuovaVersione();
      giaControllata = true;
    });
  }

  function registra() {
    var sw = contenitore();
    if (!sw) return Promise.resolve(null);
    try {
      return sw.register('sw.js').catch(function (err) {
        CasaNostra.errori.registra(err, 'registrazione del Service Worker');
        return null;
      });
    } catch (err) {
      CasaNostra.errori.registra(err, 'registrazione del Service Worker');
      return Promise.resolve(null);
    }
  }

  CasaNostra.pwa = { registra: registra };

  var sw = contenitore();
  if (sw) {
    try { osservaNuoveVersioni(sw); } catch (e) { CasaNostra.errori.registra(e, 'Service Worker'); }
    CasaNostra.alPronto(registra);
  }
})(window.CasaNostra);
