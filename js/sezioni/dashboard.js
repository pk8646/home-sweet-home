/*
 * CasaNostra.sezioni.dashboard — la Home: disegna in una griglia tutte le schede registrate con
 * CasaNostra.ui.registraScheda, nell'ordine delle schede (CasaNostra.impostazioni.ordineEffettivo), ciascuna in
 * isolamento (un errore resta dentro la sua scheda).
 * Le schede nascoste nelle impostazioni (schedeVisibili[id] === false) non vengono disegnate,
 * salvo quelle con nascondibile: false. Al cambio di giorno si ridisegnano le schede con dipendeDallaData.
 *
 * Trascinamento (ticket #20): tenendo premuto il titolo di una scheda spostabile per PRESSIONE_MS, senza muoversi
 * più di SOGLIA_PX, la scheda si solleva e segue il puntatore, e un segnaposto occupa il punto d'arrivo. Un solo
 * gestore a Pointer Events, con la stessa regola per mouse, dito e penna (niente HTML5 drag-and-drop). Il rilascio
 * dentro la griglia salva l'ordine con CasaNostra.impostazioni.cambiaOrdineSchede; il rilascio fuori dalla griglia,
 * Esc e pointercancel annullano. Il gesto sposta i riquadri: le schede non si ridisegnano.
 * Col dito (ticket #21) uno scorrimento che parte dal titolo resta uno scorrimento; a scheda sollevata la pagina non
 * scorre più sotto il dito e, col puntatore vicino al bordo della finestra, scorre da sola (scorri).
 */
(function (CasaNostra) {
  'use strict';

  var ui = CasaNostra.ui;
  var disegnate = []; // [{ def, riquadro, corpo, griglia }] nell'ordine delle schede

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
        if (gesto && gesto.voce === voce) annulla();
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
    if (dopo && gesto && gesto.segnaposto && dopo === gesto.voce.riquadro) dopo = gesto.segnaposto;
    voce.griglia.insertBefore(voce.riquadro, dopo);
  }

  function spostabile(def) { return def.nascondibile !== false; }

  function creaRiquadro(def) {
    var idTitolo = 'scheda-titolo-' + def.id;
    var corpo = ui.el('div', { class: 'scheda-corpo' });
    var titolo = ui.el('h2', { class: 'scheda-titolo', id: idTitolo }, [
      ui.el('span', { class: 'scheda-icona', 'aria-hidden': 'true', testo: def.icona || '' }),
      ' ' + def.titolo
    ]);
    var riquadro = ui.el('section', { class: 'scheda scheda-' + def.id, 'data-scheda': def.id, 'aria-labelledby': idTitolo }, [titolo, corpo]);
    var voce = { def: def, riquadro: riquadro, corpo: corpo };
    if (spostabile(def)) {
      titolo.classList.add('scheda-titolo-spostabile');
      titolo.appendChild(ui.el('span', { class: 'scheda-maniglia', 'aria-hidden': 'true', testo: '⠿' }));
      titolo.addEventListener('pointerdown', function (ev) { premi(voce, ev); });
      // touch-action si legge solo all'inizio del tocco, quindi non può cambiare a metà gesto: finché la scheda non
      // si solleva il dito scorre la pagina; dopo, il primo touchmove annullato impedisce al browser di iniziare a
      // scorrere (altrimenti manderebbe pointercancel). Serve un ascoltatore non passivo.
      titolo.addEventListener('touchmove', trattieni, { passive: false });
      titolo.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
    } else {
      riquadro.setAttribute('data-fissa', '');
    }
    return voce;
  }

  // ---------- trascinamento ----------

  var PRESSIONE_MS = 400;
  var SOGLIA_PX = 10;
  var BORDO_PX = 60;
  var VELOCITA_PX_S = 600;
  var scorriProtetta = CasaNostra.errori.protetta(scorri, 'scorrimento automatico');
  var gesto = null; // il gesto in corso: uno solo alla volta

  function premi(voce, ev) {
    if (gesto || !ev.isPrimary || ev.button !== 0 || !voce.griglia) return;
    // Niente azione predefinita del mouse: non parte una selezione del testo, che a un trascinamento successivo
    // diventerebbe un drag-and-drop nativo (e il browser manderebbe pointercancel). Sul tocco lo scorrimento non
    // dipende da questo, ma da touch-action.
    ev.preventDefault();
    gesto = {
      voce: voce, griglia: voce.griglia, idPuntatore: ev.pointerId,
      inizioX: ev.clientX, inizioY: ev.clientY, x: ev.clientX, y: ev.clientY,
      timer: setTimeout(CasaNostra.errori.protetta(solleva, 'trascinamento della scheda'), PRESSIONE_MS),
      attivo: false
    };
    // La cattura va alla griglia, che non si sposta durante il gesto (un nodo spostato nel DOM perde la cattura):
    // riceve tutti gli eventi del puntatore, anche fuori dalla griglia.
    try { gesto.griglia.setPointerCapture(ev.pointerId); } catch (e) { /* puntatore già rilasciato */ }
    gesto.griglia.addEventListener('pointermove', muovi);
    gesto.griglia.addEventListener('pointerup', rilascia);
    gesto.griglia.addEventListener('pointercancel', annullaPuntatore);
    gesto.griglia.addEventListener('lostpointercapture', annullaPuntatore);
  }

  /** Dopo PRESSIONE_MS di pressione: la scheda si solleva e al suo posto compare il segnaposto. */
  function solleva() {
    var g = gesto;
    if (!g) return;
    g.timer = null;
    var riquadro = g.voce.riquadro;
    if (riquadro.parentNode !== g.griglia) return fine();
    var r = riquadro.getBoundingClientRect();
    g.attivo = true;
    g.ordinePrima = idMostrati(g.griglia);
    g.scostamentoX = g.x - r.left;
    g.scostamentoY = g.y - r.top;
    // Durante il gesto la griglia non si accorcia: se la pagina si accorciasse, lo scorrimento tornerebbe
    // indietro e le schede salterebbero sotto il puntatore fermo.
    g.griglia.style.minHeight = g.griglia.getBoundingClientRect().height + 'px';
    // Niente ancoraggio dello scorrimento: quando il segnaposto si sposta sopra le schede visibili il browser
    // correggerebbe lo scorrimento da solo, e le schede sotto il puntatore cambierebbero di nuovo.
    g.griglia.style.overflowAnchor = 'none';
    g.segnaposto = ui.el('div', { class: 'scheda-segnaposto', 'aria-hidden': 'true' });
    g.segnaposto.style.height = r.height + 'px';
    g.griglia.insertBefore(g.segnaposto, riquadro.nextSibling);
    riquadro.style.width = r.width + 'px';
    riquadro.style.height = r.height + 'px';
    riquadro.classList.add('scheda-sollevata');
    segui(g);
    document.addEventListener('keydown', tasto, true);
    g.fotogramma = requestAnimationFrame(scorriProtetta);
  }

  /**
   * Scorrimento automatico: un ciclo requestAnimationFrame che esiste solo a scheda sollevata. Col puntatore entro
   * BORDO_PX dal bordo alto o basso della finestra la pagina scorre a VELOCITA_PX_S; le schede passano sotto il
   * puntatore fermo, quindi il segnaposto si riposiziona.
   */
  function scorri(istante) {
    var g = gesto;
    if (!g || !g.attivo) return;
    var direzione = g.y < BORDO_PX ? -1 : (g.y > window.innerHeight - BORDO_PX ? 1 : 0);
    // Il primo fotogramma (e uno dopo una pausa lunga della pagina) non scorre: conta solo il tempo tra due fotogrammi vicini.
    var trascorso = g.istantePrima === undefined ? 0 : Math.min(istante - g.istantePrima, 100);
    g.istantePrima = istante;
    if (direzione && trascorso > 0) {
      var prima = window.pageYOffset;
      window.scrollBy(0, direzione * Math.max(1, Math.round(VELOCITA_PX_S * trascorso / 1000)));
      if (window.pageYOffset !== prima) spostaSegnaposto(g);
    }
    g.fotogramma = requestAnimationFrame(scorriProtetta);
  }

  /** Col dito, a scheda sollevata la pagina non scorre più sotto il dito. */
  function trattieni(ev) {
    if (gesto && gesto.attivo && ev.cancelable) ev.preventDefault();
  }

  /** La scheda sollevata segue il puntatore. */
  function segui(g) {
    g.voce.riquadro.style.left = (g.x - g.scostamentoX) + 'px';
    g.voce.riquadro.style.top = (g.y - g.scostamentoY) + 'px';
  }

  function muovi(ev) {
    var g = gesto;
    if (!g || ev.pointerId !== g.idPuntatore) return;
    g.x = ev.clientX;
    g.y = ev.clientY;
    if (!g.attivo) {
      // Prima della pressione prolungata, un movimento oltre la soglia non è un trascinamento.
      if (Math.abs(g.x - g.inizioX) > SOGLIA_PX || Math.abs(g.y - g.inizioY) > SOGLIA_PX) fine();
      return;
    }
    ev.preventDefault();
    segui(g);
    spostaSegnaposto(g);
  }

  /**
   * Porta il segnaposto al posto della scheda spostabile sotto il puntatore: le altre si spostano per fargli posto.
   * Le schede fisse non sono mai un bersaglio, quindi nessuna scheda finisce prima di loro.
   */
  function spostaSegnaposto(g) {
    var figli = Array.prototype.slice.call(g.griglia.children);
    var sotto = null;
    for (var i = 0; i < figli.length && !sotto; i++) {
      var n = figli[i];
      if (n === g.voce.riquadro || !n.hasAttribute('data-scheda') || n.hasAttribute('data-fissa')) continue;
      var r = n.getBoundingClientRect();
      if (g.x >= r.left && g.x <= r.right && g.y >= r.top && g.y <= r.bottom) sotto = n;
    }
    if (!sotto) return;
    var dopo = figli.indexOf(sotto) > figli.indexOf(g.segnaposto);
    g.griglia.insertBefore(g.segnaposto, dopo ? sotto.nextSibling : sotto);
    // Il riquadro sollevato (fuori dal flusso) sta subito prima del segnaposto: l'ordine nel DOM è quello d'arrivo.
    g.griglia.insertBefore(g.voce.riquadro, g.segnaposto);
  }

  function dentroGriglia(g) {
    var r = g.griglia.getBoundingClientRect();
    return g.x >= r.left && g.x <= r.right && g.y >= r.top && g.y <= r.bottom;
  }

  function rilascia(ev) {
    var g = gesto;
    if (!g || ev.pointerId !== g.idPuntatore) return;
    g.x = ev.clientX;
    g.y = ev.clientY;
    if (!g.attivo) return fine();
    if (!dentroGriglia(g)) return annulla();
    spostaSegnaposto(g); // il rilascio può arrivare in un punto nuovo, senza un pointermove prima
    fine();
    var mostrate = idMostrati(g.griglia);
    if (mostrate.join() !== g.ordinePrima.join()) salvaOrdine(g.griglia, mostrate);
  }

  function tasto(ev) {
    if (ev.key !== 'Escape' && ev.key !== 'Esc') return;
    ev.preventDefault();
    ev.stopPropagation();
    annulla();
  }

  function annullaPuntatore(ev) {
    if (gesto && ev.pointerId === gesto.idPuntatore) annulla();
  }

  /** Annulla il gesto: la scheda torna dov'era (disegnate non cambia durante il gesto). */
  function annulla() {
    var g = gesto;
    if (!g) return;
    fine();
    if (g.attivo) ordina(g.griglia, disegnate.map(function (v) { return v.def.id; }));
  }

  /** Chiude il gesto: toglie timer, ascoltatori, segnaposto e aspetto sollevato (la scheda resta dove si trova). */
  function fine() {
    var g = gesto;
    if (!g) return;
    gesto = null;
    if (g.timer) clearTimeout(g.timer);
    if (g.fotogramma) cancelAnimationFrame(g.fotogramma);
    g.griglia.removeEventListener('pointermove', muovi);
    g.griglia.removeEventListener('pointerup', rilascia);
    g.griglia.removeEventListener('pointercancel', annullaPuntatore);
    g.griglia.removeEventListener('lostpointercapture', annullaPuntatore);
    document.removeEventListener('keydown', tasto, true);
    try {
      if (g.griglia.hasPointerCapture(g.idPuntatore)) g.griglia.releasePointerCapture(g.idPuntatore);
    } catch (e) { /* già rilasciato */ }
    if (g.segnaposto) {
      g.griglia.style.minHeight = g.griglia.style.overflowAnchor = '';
      if (g.segnaposto.parentNode) g.segnaposto.parentNode.removeChild(g.segnaposto);
      var s = g.voce.riquadro.style;
      s.left = s.top = s.width = s.height = '';
      g.voce.riquadro.classList.remove('scheda-sollevata');
    }
  }

  /** Gli id delle schede spostabili nella griglia, nell'ordine in cui compaiono. */
  function idMostrati(griglia) {
    return Array.prototype.filter.call(griglia.children, function (n) {
      return n.hasAttribute('data-scheda') && !n.hasAttribute('data-fissa');
    }).map(function (n) { return n.getAttribute('data-scheda'); });
  }

  /** Mette `disegnate` nell'ordine `ids` (le fisse restano in testa) e i riquadri nella griglia nello stesso ordine. */
  function ordina(griglia, ids) {
    var posizione = {};
    ids.forEach(function (id, i) { posizione[id] = i; });
    function pos(v) { return Object.prototype.hasOwnProperty.call(posizione, v.def.id) ? posizione[v.def.id] : -1; }
    disegnate.sort(function (a, b) { return pos(a) - pos(b); });
    disegnate.filter(function (v) { return v.riquadro.parentNode === griglia; }).forEach(function (v, i) {
      if (griglia.children[i] !== v.riquadro) griglia.insertBefore(v.riquadro, griglia.children[i] || null);
    });
  }

  function salvaOrdine(griglia, mostrate) {
    // Le schede che oggi sono fuori dalla griglia restano attaccate a quella che le precede (stessa regola del salvataggio).
    var definizioni = disegnate.map(function (v) { return v.def; });
    ordina(griglia, CasaNostra.impostazioni.ordineConMostrate(definizioni,
      { ordineSchede: definizioni.map(function (d) { return d.id; }) }, mostrate));
    return CasaNostra.impostazioni.cambiaOrdineSchede(function (attuali) {
      return CasaNostra.impostazioni.ordineConMostrate(ui.schede(), attuali, mostrate);
    }, function (salvate) {
      // A coda vuota la griglia mostra l'ordine salvato davvero: se il salvataggio è fallito, quello di prima.
      if (disegnate.length && disegnate[0].griglia === griglia) {
        ordina(griglia, CasaNostra.impostazioni.ordineEffettivo(ui.schede(), salvate).map(function (d) { return d.id; }));
      }
    }).catch(function (err) {
      CasaNostra.errori.gestisci(err, 'ordine delle schede');
    });
  }

  // ---------- disegno ----------

  function esci() {
    annulla();
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
      var visibili = CasaNostra.impostazioni.ordineEffettivo(ui.schede(), impostazioni).filter(function (def) {
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
