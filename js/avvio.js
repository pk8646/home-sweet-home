/*
 * Avvio — ultimo script: verifica la persistenza, applica le impostazioni di base, avvia l'interfaccia
 * e poi esegue le funzioni registrate con CasaNostra.alPronto(fn).
 */
(function (CasaNostra) {
  'use strict';

  function avvia() {
    return CasaNostra.db.apri().then(function () {
      return CasaNostra.impostazioni.leggi().then(function (imp) {
        CasaNostra.ui.impostaNomeCasa(imp.nomeVisualizzato);
      });
    }).catch(function (err) {
      CasaNostra.errori.registra(err, 'avvio');
      CasaNostra.ui.avviso('persistenza', CasaNostra.errori.messaggio(err));
    }).then(function () {
      return CasaNostra.ui.avvia();
    }).then(function () {
      CasaNostra._segnalaPronta().forEach(function (fn) {
        Promise.resolve().then(fn).catch(function (e) { CasaNostra.errori.gestisci(e, 'avvio'); });
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia);
  else avvia();
})(window.CasaNostra);
