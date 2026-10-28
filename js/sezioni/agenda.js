/*
 * CasaNostra.sezioni.agenda — pagina #/agenda e scheda della dashboard.
 * Segnaposto: la sezione vera arriva con il ticket #4. Sostituire il contenuto di questo file
 * (e di css/sezioni/agenda.css, js/dominio/agenda.js) senza toccare index.html.
 */
(function (CasaNostra) {
  'use strict';

  var ui = CasaNostra.ui;

  ui.registraSezione({
    id: 'agenda', titolo: 'Agenda', icona: '📅', ordine: 30,
    disegna: function (contenitore) {
      contenitore.appendChild(ui.el('p', { class: 'vuoto', testo: 'Questa sezione è in arrivo.' }));
    }
  });

  CasaNostra.sezioni.agenda = {};
})(window.CasaNostra);
