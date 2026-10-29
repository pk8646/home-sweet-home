/*
 * CasaNostra.errori — gestione centralizzata degli errori.
 * Un unico punto riceve gli errori (anche window.onerror e unhandledrejection), li registra in console
 * con console.warn('[Casa Nostra] ...') e mostra un toast in italiano comprensibile.
 *
 *   throw CasaNostra.errori.perUtente('Il titolo è obbligatorio.');   // messaggio mostrato così com'è
 *   CasaNostra.errori.gestisci(err, 'salvataggio prodotto');           // registra + toast
 *   CasaNostra.errori.messaggio(err)                                   // testo per l'utente
 */
(function (CasaNostra) {
  'use strict';

  var GENERICO = 'Si è verificato un errore imprevisto. Se il problema continua, ricarica la pagina.';
  var ultimoToast = { testo: '', nodo: null };

  function perUtente(messaggio, causa) {
    var e = new Error(messaggio);
    e.perUtente = true;
    e.causa = causa;
    return e;
  }

  function messaggio(err) {
    if (err && err.perUtente && err.message) return err.message;
    // Le eccezioni del browser sullo spazio esaurito hanno il messaggio della persistenza ("Spazio esaurito…").
    if (err && err.name === 'QuotaExceededError') return CasaNostra.db.traduciErrore(err).message;
    return GENERICO;
  }

  function registra(err, contesto) {
    try {
      console.warn('[Casa Nostra]' + (contesto ? ' ' + contesto + ':' : ''), err && err.causa ? err.causa : err);
    } catch (e) { /* console assente */ }
  }

  function gestisci(err, contesto) {
    registra(err, contesto);
    var testo = messaggio(err);
    // Niente raffiche: lo stesso messaggio non si ripete finché il toast precedente è ancora visibile.
    if (testo === ultimoToast.testo && ultimoToast.nodo && ultimoToast.nodo.isConnected) return;
    var nodo = CasaNostra.ui && CasaNostra.ui.toast ? CasaNostra.ui.toast(testo, { tipo: 'errore' }) : null;
    ultimoToast = { testo: testo, nodo: nodo };
  }

  /** Avvolge una funzione (es. un gestore di evento async) in modo che gli errori finiscano in gestisci(). */
  function protetta(fn, contesto) {
    return function () {
      try {
        var r = fn.apply(this, arguments);
        if (r && typeof r.then === 'function') {
          return r.catch(function (e) { gestisci(e, contesto); });
        }
        return r;
      } catch (e) {
        gestisci(e, contesto);
      }
    };
  }

  function installa() {
    window.addEventListener('error', function (ev) {
      gestisci(ev.error || new Error(ev.message), 'errore non gestito');
      ev.preventDefault();
    });
    window.addEventListener('unhandledrejection', function (ev) {
      gestisci(ev.reason, 'promessa rifiutata non gestita');
      ev.preventDefault();
    });
  }

  CasaNostra.errori = {
    perUtente: perUtente,
    messaggio: messaggio,
    registra: registra,
    gestisci: gestisci,
    protetta: protetta,
    installa: installa
  };

  installa();
})(window.CasaNostra);
