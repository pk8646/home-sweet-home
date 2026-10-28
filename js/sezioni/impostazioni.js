/*
 * CasaNostra.sezioni.impostazioni — pagina #/impostazioni.
 * La pagina è composta dai gruppi registrati con CasaNostra.ui.registraGruppoImpostazioni({ id, titolo,
 * ordine, disegna(corpo, contesto) }), così ogni ticket aggiunge il proprio gruppo dal proprio file
 * (es. Località in js/sezioni/meteo.js, Backup in un suo file). Ogni gruppo è disegnato in isolamento.
 * Ordini suggeriti: generali 10, località 20, dashboard 30, schermo 40, backup 60, archivio foto 70,
 * privacy 80, ripristino iniziale 90.
 */
(function (CasaNostra) {
  'use strict';

  var ui = CasaNostra.ui;

  function disegnaGruppo(def, contenitore, contesto) {
    var idTitolo = 'impostazioni-' + def.id;
    var corpo = ui.el('div', { class: 'gruppo-corpo' });
    contenitore.appendChild(ui.el('section', { class: 'gruppo-impostazioni gruppo-' + def.id, 'aria-labelledby': idTitolo }, [
      ui.el('h3', { class: 'gruppo-titolo', id: idTitolo, testo: def.titolo }),
      corpo
    ]));
    return Promise.resolve().then(function () { return def.disegna(corpo, contesto); }).catch(function (err) {
      CasaNostra.errori.registra(err, 'gruppo di impostazioni ' + def.id);
      ui.svuota(corpo).appendChild(ui.messaggioErrore(err, 'Non è stato possibile mostrare queste impostazioni.'));
    });
  }

  ui.registraSezione({
    id: 'impostazioni', titolo: 'Impostazioni', icona: '⚙️', ordine: 90,
    disegna: function (contenitore, contesto) {
      var gruppi = ui.gruppiImpostazioni();
      if (!gruppi.length) {
        contenitore.appendChild(ui.el('p', { class: 'vuoto', testo: 'Le impostazioni sono in arrivo.' }));
        return;
      }
      return Promise.all(gruppi.map(function (g) { return disegnaGruppo(g, contenitore, contesto); }));
    }
  });

  CasaNostra.sezioni.impostazioni = {};
})(window.CasaNostra);
