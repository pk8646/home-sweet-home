/*
 * CasaNostra.presentazione — la Presentazione delle foto (ticket #9): schermo intero, una foto ogni 10 secondi.
 * In memoria ci sono solo la foto corrente e, al massimo, la successiva; ogni URL temporaneo si revoca
 * appena la foto non serve più. Un tocco, Esc o "indietro" chiudono. Senza Fullscreen API occupa la finestra.
 *
 *   CasaNostra.presentazione.avvia(elenco)  // elenco = CasaNostra.foto.elenco() (metadati, dalla più recente)
 *   CasaNostra.presentazione.chiudi()       // da chiamare in esci() della sezione
 */
(function (CasaNostra) {
  'use strict';

  var INTERVALLO_MS = 10000;
  var ui = CasaNostra.ui;
  var aperta = null; // { chiudi() }

  function avvia(elenco) {
    chiudi();
    if (!elenco || !elenco.length) return;
    var foto = CasaNostra.foto;
    var urls = foto.gruppoUrl();
    var indice = 0;
    var timer = null;
    var chiusa = false;
    var corrente = null;   // { url, immagine }
    var successiva = null; // { indice, promessa -> { url, immagine } | null }

    var contenitore = ui.el('div', {
      class: 'presentazione', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Presentazione', tabindex: '-1'
    });

    function carica(i) {
      var m = elenco[i];
      return foto.blobPieno(m.id).then(function (blob) {
        if (chiusa) return null;
        var immagine = ui.el('img', { class: 'presentazione-foto', alt: m.nome });
        var url = blob ? urls.crea(blob) : null;
        if (url) immagine.src = url;
        return { url: url, immagine: immagine };
      });
    }

    function scarta(f) {
      if (!f) return;
      f.immagine.removeAttribute('src');
      if (f.immagine.parentNode) f.immagine.parentNode.removeChild(f.immagine);
      if (f.url) urls.revoca(f.url);
    }

    function mostra(f) {
      if (chiusa || !f) { scarta(f); return; }
      var vecchia = corrente;
      corrente = f;
      contenitore.appendChild(f.immagine);
      scarta(vecchia);
      if (elenco.length > 1) {
        var i = (indice + 1) % elenco.length;
        successiva = { indice: i, promessa: carica(i) };
      }
      timer = setTimeout(avanza, INTERVALLO_MS);
    }

    function avanza() {
      timer = null;
      if (!successiva) { timer = setTimeout(avanza, INTERVALLO_MS); return; } // una sola foto: resta lì
      var s = successiva;
      successiva = null;
      indice = s.indice;
      s.promessa.then(mostra).catch(errore);
    }

    function errore(e) {
      chiudiQuesta();
      CasaNostra.errori.gestisci(e, 'presentazione');
    }

    function chiudiQuesta() {
      if (chiusa) return;
      chiusa = true;
      if (timer) clearTimeout(timer);
      timer = null;
      scarta(corrente);
      corrente = null;
      if (successiva) successiva.promessa.then(scarta, function () {});
      successiva = null;
      urls.revocaTutti();
      window.removeEventListener('popstate', chiudiQuesta);
      document.removeEventListener('fullscreenchange', alCambioSchermoIntero);
      if (document.fullscreenElement === contenitore && document.exitFullscreen) {
        Promise.resolve(document.exitFullscreen()).catch(function () { /* già uscita */ });
      }
      // La voce di cronologia aggiunta all'avvio va tolta, se ci siamo ancora sopra (chiusura con tocco o Esc).
      if (history.state && history.state.presentazione === voceStoria) history.back();
      if (contenitore.parentNode) contenitore.parentNode.removeChild(contenitore);
      if (aperta && aperta.chiudi === chiudiQuesta) aperta = null;
      if (precedenteFocus && precedenteFocus.focus && document.contains(precedenteFocus)) precedenteFocus.focus();
    }

    function alCambioSchermoIntero() {
      // Uscita dallo schermo intero fatta dal sistema (es. Esc): si chiude anche la presentazione.
      if (!document.fullscreenElement) chiudiQuesta();
    }

    var precedenteFocus = document.activeElement;
    var voceStoria = CasaNostra.nuovoId();
    contenitore.addEventListener('click', chiudiQuesta);
    contenitore.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); chiudiQuesta(); }
    });
    // "Indietro" chiude la presentazione e lascia la galleria dov'è: stessa URL, voce di cronologia in più.
    history.pushState({ presentazione: voceStoria }, '', location.href);
    window.addEventListener('popstate', chiudiQuesta);

    document.body.appendChild(contenitore);
    contenitore.focus();
    aperta = { chiudi: chiudiQuesta };
    if (contenitore.requestFullscreen && document.fullscreenEnabled !== false) {
      try {
        Promise.resolve(contenitore.requestFullscreen()).then(function () {
          if (chiusa) return;
          document.addEventListener('fullscreenchange', alCambioSchermoIntero);
        }, function () { /* rifiutato: resta a tutta finestra */ });
      } catch (e) { /* non disponibile: resta a tutta finestra */ }
    }
    return carica(0).then(mostra).catch(errore);
  }

  function chiudi() { if (aperta) aperta.chiudi(); }

  CasaNostra.presentazione = { avvia: avvia, chiudi: chiudi };
})(window.CasaNostra);
