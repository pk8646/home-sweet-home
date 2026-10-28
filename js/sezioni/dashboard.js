/*
 * CasaNostra.sezioni.dashboard — la Home: disegna in una griglia tutte le schede registrate con
 * CasaNostra.ui.registraScheda, ciascuna in isolamento (un errore resta dentro la sua scheda).
 * Le schede nascoste nelle impostazioni (schedeVisibili[id] === false) non vengono disegnate,
 * salvo quelle con nascondibile: false. Al cambio di giorno si ridisegnano le schede con dipendeDallaData.
 */
(function (CasaNostra) {
  'use strict';

  var ui = CasaNostra.ui;
  var disegnate = []; // [{ def, cornice, corpo }]

  function disegnaScheda(voce) {
    var def = voce.def;
    var corpo = ui.svuota(voce.corpo);
    voce.cornice.hidden = false;
    var contesto = ui.creaContesto([], function () { return disegnaScheda(voce); });
    return Promise.resolve().then(function () {
      return def.disegna(corpo, contesto);
    }).then(function (esito) {
      if (esito === false) voce.cornice.hidden = true;
    }).catch(function (err) {
      CasaNostra.errori.registra(err, 'disegno della scheda ' + def.id);
      ui.svuota(corpo).appendChild(ui.messaggioErrore(err, 'Non è stato possibile mostrare questa scheda.'));
    });
  }

  function creaCornice(def) {
    var idTitolo = 'scheda-titolo-' + def.id;
    var corpo = ui.el('div', { class: 'scheda-corpo' });
    var cornice = ui.el('section', { class: 'scheda scheda-' + def.id, 'data-scheda': def.id, 'aria-labelledby': idTitolo }, [
      ui.el('h2', { class: 'scheda-titolo', id: idTitolo }, [
        ui.el('span', { class: 'scheda-icona', 'aria-hidden': 'true', testo: def.icona || '' }),
        ' ' + def.titolo
      ]),
      corpo
    ]);
    return { def: def, cornice: cornice, corpo: corpo };
  }

  function esci() {
    disegnate.forEach(function (v) {
      if (v.def.esci) {
        try { v.def.esci(); } catch (e) { CasaNostra.errori.registra(e, 'uscita dalla scheda ' + v.def.id); }
      }
    });
    disegnate = [];
  }

  function disegna(contenitore) {
    esci();
    return CasaNostra.impostazioni.leggi().catch(function () { return null; }).then(function (impostazioni) {
      var griglia = ui.el('div', { class: 'dashboard-griglia' });
      contenitore.appendChild(griglia);
      var visibili = ui.schede().filter(function (def) {
        return def.nascondibile === false || CasaNostra.impostazioni.schedaVisibile(impostazioni, def.id);
      });
      if (!visibili.length) {
        griglia.appendChild(ui.el('p', { class: 'vuoto', testo: 'Nessuna scheda da mostrare. Puoi riattivarle dalle Impostazioni.' }));
        return;
      }
      disegnate = visibili.map(creaCornice);
      disegnate.forEach(function (v) { griglia.appendChild(v.cornice); });
      return Promise.all(disegnate.map(disegnaScheda));
    });
  }

  function alCambioGiorno() {
    return Promise.all(disegnate.filter(function (v) { return v.def.dipendeDallaData; }).map(disegnaScheda));
  }

  ui.registraSezione({ id: 'home', titolo: 'Home', icona: '🏠', ordine: 0, disegna: disegna, esci: esci, alCambioGiorno: alCambioGiorno });

  CasaNostra.sezioni.dashboard = { ridisegnaSchede: alCambioGiorno };
})(window.CasaNostra);
