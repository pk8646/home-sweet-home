/*
 * Casa Nostra — namespace globale.
 * Ogni script aggiunge UNA sola proprietà a window.CasaNostra (es. CasaNostra.db, CasaNostra.ui,
 * CasaNostra.dominio.spesa, CasaNostra.sezioni.spesa). Script classici, nessun modulo ES, nessuna dipendenza.
 */
(function () {
  'use strict';

  var CasaNostra = window.CasaNostra || {};

  /** Contenitori dei moduli di dominio (puri) e delle sezioni dell'interfaccia. */
  CasaNostra.dominio = CasaNostra.dominio || {};
  CasaNostra.sezioni = CasaNostra.sezioni || {};

  /** Prefisso di ogni chiave dell'app in LocalStorage (oggi solo la copia del meteo; il ripristino le toglie tutte). */
  CasaNostra.PREFISSO_LOCALSTORAGE = 'casaNostra.';

  /** Identificativo stabile generato sul client: timestamp in base 36 + parte casuale. */
  CasaNostra.nuovoId = function () {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  };

  /**
   * Esegue fn dopo il primo disegno dell'app (es. registrazione del Service Worker, benvenuto).
   * Utilizzabile da qualunque script, anche caricato prima di avvio.js.
   */
  var inAttesa = [];
  var pronta = false;
  CasaNostra.alPronto = function (fn) {
    if (pronta) setTimeout(fn, 0);
    else inAttesa.push(fn);
  };
  /** Chiamata una sola volta da avvio.js. */
  CasaNostra._segnalaPronta = function () {
    pronta = true;
    var lista = inAttesa;
    inAttesa = [];
    return lista;
  };

  window.CasaNostra = CasaNostra;
})();
