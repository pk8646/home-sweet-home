/*
 * CasaNostra.sezioni.casa — pagina #/casa e scheda della dashboard.
 * Segnaposto: la sezione vera arriva con il ticket #5. Sostituire il contenuto di questo file
 * (e di css/sezioni/casa.css, js/dominio/casa.js) senza toccare index.html.
 */
(function (CasaNostra) {
  'use strict';

  var ui = CasaNostra.ui;

  ui.registraSezione({
    id: 'casa', titolo: 'Casa', icona: '🛠️', ordine: 50,
    disegna: function (contenitore) {
      contenitore.appendChild(ui.el('p', { class: 'vuoto', testo: 'Questa sezione è in arrivo.' }));
    }
  });

  CasaNostra.sezioni.casa = {};
})(window.CasaNostra);
