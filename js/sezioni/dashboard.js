/*
 * CasaNostra.sezioni.dashboard — la Home: disegna in una griglia tutte le schede registrate con
 * CasaNostra.ui.registraScheda, ciascuna in isolamento (un errore resta dentro la sua scheda).
 * Le schede nascoste nelle impostazioni (schedeVisibili[id] === false) non vengono disegnate,
 * salvo quelle con nascondibile: false. Al cambio di giorno si ridisegnano le schede con dipendeDallaData.
 */
(function (CasaNostra) {
  'use strict';

  var ui = CasaNostra.ui;
  var disegnate = []; // [{ def, riquadro, corpo }]

  function disegnaScheda(voce) {
    var def = voce.def;
    var corpo = ui.svuota(voce.corpo);
    voce.riquadro.hidden = false;
    var contesto = ui.creaContesto([], function () { return disegnaScheda(voce); });
    return Promise.resolve().then(function () {
      return def.disegna(corpo, contesto);
    }).then(function (esito) {
      // Una scheda che non ha niente da mostrare esce dalla griglia (non lascia una cella vuota);
      // se ridisegnandola torna visibile, rientra al suo posto.
      if (esito === false) {
        voce.riquadro.hidden = true;
        if (voce.riquadro.parentNode) voce.riquadro.parentNode.removeChild(voce.riquadro);
      } else {
        rientra(voce);
      }
    }).catch(function (err) {
      CasaNostra.errori.registra(err, 'disegno della scheda ' + def.id);
      rientra(voce);
      ui.svuota(corpo).appendChild(ui.messaggioErrore(err, 'Non è stato possibile mostrare questa scheda.'));
    });
  }

  /** Rimette nella griglia, nella sua posizione, una scheda che ne era uscita. */
  function rientra(voce) {
    var i = disegnate.indexOf(voce);
    if (voce.riquadro.parentNode || i < 0 || !voce.griglia) return;
    var dopo = null;
    for (var j = i + 1; j < disegnate.length && !dopo; j++) {
      if (disegnate[j].riquadro.parentNode === voce.griglia) dopo = disegnate[j].riquadro;
    }
    voce.griglia.insertBefore(voce.riquadro, dopo);
  }

  function creaRiquadro(def) {
    var idTitolo = 'scheda-titolo-' + def.id;
    var corpo = ui.el('div', { class: 'scheda-corpo' });
    var riquadro = ui.el('section', { class: 'scheda scheda-' + def.id, 'data-scheda': def.id, 'aria-labelledby': idTitolo }, [
      ui.el('h2', { class: 'scheda-titolo', id: idTitolo }, [
        ui.el('span', { class: 'scheda-icona', 'aria-hidden': 'true', testo: def.icona || '' }),
        ' ' + def.titolo
      ]),
      corpo
    ]);
    return { def: def, riquadro: riquadro, corpo: corpo };
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
      disegnate = visibili.map(creaRiquadro);
      disegnate.forEach(function (v) { v.griglia = griglia; griglia.appendChild(v.riquadro); });
      return Promise.all(disegnate.map(disegnaScheda));
    });
  }

  function ridisegnaSchedeDellaData() {
    return Promise.all(disegnate.filter(function (v) { return v.def.dipendeDallaData; }).map(disegnaScheda));
  }

  ui.registraSezione({ id: 'home', titolo: 'Home', icona: '🏠', ordine: 0, disegna: disegna, esci: esci, alCambioGiorno: ridisegnaSchedeDellaData });

  CasaNostra.sezioni.dashboard = { ridisegnaSchedeDellaData: ridisegnaSchedeDellaData };
})(window.CasaNostra);
