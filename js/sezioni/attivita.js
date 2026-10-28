/*
 * CasaNostra.sezioni.attivita — pagina #/attivita e scheda della dashboard.
 * Segnaposto: la sezione vera arriva con il ticket #3. Sostituire il contenuto di questo file
 * (e di css/sezioni/attivita.css, js/dominio/attivita.js) senza toccare index.html.
 */
(function (CasaNostra) {
  'use strict';

  var ui = CasaNostra.ui;

  ui.registraSezione({
    id: 'attivita', titolo: 'Attività', icona: '✅', ordine: 40,
    disegna: function (contenitore) {
      contenitore.appendChild(ui.el('p', { class: 'vuoto', testo: 'Questa sezione è in arrivo.' }));
    }
  });

  CasaNostra.sezioni.attivita = {};
})(window.CasaNostra);
