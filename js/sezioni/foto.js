/*
 * CasaNostra.sezioni.foto — pagina #/foto e scheda della dashboard.
 * Segnaposto: la sezione vera arriva con il ticket #8. Sostituire il contenuto di questo file
 * (e di css/sezioni/foto.css, js/foto.js) senza toccare index.html.
 */
(function (CasaNostra) {
  'use strict';

  var ui = CasaNostra.ui;

  ui.registraSezione({
    id: 'foto', titolo: 'Foto', icona: '🖼️', ordine: 60,
    disegna: function (contenitore) {
      contenitore.appendChild(ui.el('p', { class: 'vuoto', testo: 'Questa sezione è in arrivo.' }));
    }
  });

  CasaNostra.sezioni.foto = {};
})(window.CasaNostra);
