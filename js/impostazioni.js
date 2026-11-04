/*
 * CasaNostra.impostazioni — lettura e scrittura del record unico delle impostazioni (ADR-0001: in IndexedDB).
 *
 *   CasaNostra.impostazioni.leggi()               -> Promise<impostazioni complete (con i valori predefiniti)>
 *   CasaNostra.impostazioni.aggiorna({ ... })     -> Promise<impostazioni aggiornate> (unione superficiale)
 *   CasaNostra.impostazioni.PREDEFINITE           -> valori predefiniti
 *
 *   CasaNostra.impostazioni.spostabile(def)                         -> true se la scheda non è fissa (nascondibile !== false)
 *   CasaNostra.impostazioni.ordineEffettivo(schede, ordineSchede)   -> le definizioni delle schede nell'ordine delle schede
 *   CasaNostra.impostazioni.idSpostabili(schede, ordineSchede)      -> gli id delle schede spostabili nell'ordine delle schede
 *   CasaNostra.impostazioni.ordineConMostrate(schede, ordineSchede, mostrate) -> ordine completo da salvare dopo un riordino
 *   CasaNostra.impostazioni.cambiaOrdineSchede(calcola, mostra) -> Promise: salva in coda un nuovo ordineSchede
 *
 * schedeVisibili: { idScheda: false } nasconde una scheda della dashboard; un id assente = visibile.
 * ordineSchede: [idScheda, ...] è l'ordine delle schede scelto dalla famiglia; vuoto = ordine predefinito.
 *
 * Gli aggiornamenti passano da una coda: due aggiorna() ravvicinati non si sovrascrivono a vicenda. aggiorna()
 * accetta anche una funzione (impostazioni attuali) -> campi da cambiare, eseguita al proprio turno nella coda.
 */
(function (CasaNostra) {
  'use strict';

  var ID = 'impostazioni';

  var PREDEFINITE = {
    id: ID,
    nomeVisualizzato: '',
    localita: { nome: 'Fiumicino', latitudine: 41.77, longitudine: 12.23 },
    schedeVisibili: {},
    ordineSchede: [],
    schermoAcceso: false,
    ultimoBackup: null,             // ISO dell'ultima esportazione del backup dati
    benvenutoVisto: false,
    avvisoBackupPosticipatoFino: null // 'AAAA-MM-GG'
  };

  function copia(x) { return JSON.parse(JSON.stringify(x)); }

  function completa(record) {
    var r = copia(PREDEFINITE);
    if (record) Object.keys(record).forEach(function (k) { r[k] = record[k]; });
    r.id = ID;
    return r;
  }

  function leggiOra() {
    return CasaNostra.db.raccolta('impostazioni').get(ID).then(completa);
  }

  var coda = Promise.resolve();

  /** Legge dopo gli aggiornamenti già in coda: vede sempre l'ultimo salvataggio chiesto. */
  function leggi() {
    return coda.catch(function () {}).then(leggiOra);
  }

  function aggiorna(parziale) {
    var turno = coda.catch(function () {}).then(leggiOra).then(function (attuali) {
      var campi = typeof parziale === 'function' ? parziale(copia(attuali)) : parziale;
      var nuove = completa(Object.assign(attuali, campi || {}));
      return CasaNostra.db.raccolta('impostazioni').put(nuove);
    });
    coda = turno;
    return turno;
  }

  /** true se la scheda con questo id va mostrata nella dashboard. */
  function schedaVisibile(impostazioni, idScheda) {
    return !(impostazioni && impostazioni.schedeVisibili && impostazioni.schedeVisibili[idScheda] === false);
  }

  /** true se la scheda si può spostare (e nascondere): le schede fisse hanno nascondibile: false. */
  function spostabile(def) {
    return def.nascondibile !== false;
  }

  /**
   * Le schede (definizioni, nell'ordine predefinito) nell'ordine delle schede: prima le schede fisse, poi quelle di
   * ordineSchede nell'ordine salvato, poi le altre nell'ordine predefinito. Id sconosciuti, ripetuti o di schede fisse
   * vengono ignorati; un ordineSchede che non è un elenco vale come vuoto.
   */
  function ordineEffettivo(schede, ordineSchede) {
    var fisse = schede.filter(function (def) { return !spostabile(def); });
    var spostabili = {};
    schede.forEach(function (def) { if (spostabile(def)) spostabili[def.id] = def; });
    var salvato = Array.isArray(ordineSchede) ? ordineSchede : [];
    var scelte = [];
    salvato.forEach(function (id) {
      if (typeof id === 'string' && Object.prototype.hasOwnProperty.call(spostabili, id)) {
        scelte.push(spostabili[id]);
        delete spostabili[id];
      }
    });
    var restanti = schede.filter(function (def) { return Object.prototype.hasOwnProperty.call(spostabili, def.id); });
    return fisse.concat(scelte, restanti);
  }

  /** Gli id delle schede spostabili (non fisse) nell'ordine delle schede. */
  function idSpostabili(schede, ordineSchede) {
    return ordineEffettivo(schede, ordineSchede)
      .filter(spostabile)
      .map(function (def) { return def.id; });
  }

  /**
   * L'ordine completo delle schede spostabili (id, nascoste comprese) dopo che le schede `mostrate` (id) sono
   * state messe in quest'ordine. Ogni scheda non mostrata resta attaccata alla scheda mostrata che la precede
   * nell'ordine attuale; quelle prima della prima scheda mostrata restano in testa. Id ignoti o fissi sono ignorati.
   */
  function ordineConMostrate(schede, ordineSchede, mostrate) {
    var attuale = idSpostabili(schede, ordineSchede);
    var mostrata = {};
    mostrate.forEach(function (id) { mostrata[id] = true; });
    var testa = [];
    var gruppi = {};
    var gruppo = testa;
    attuale.forEach(function (id) {
      if (mostrata[id] === true) gruppo = gruppi[id] = [];
      gruppo.push(id);
    });
    var risultato = testa;
    mostrate.forEach(function (id) {
      if (gruppi[id]) { risultato = risultato.concat(gruppi[id]); delete gruppi[id]; }
    });
    return risultato;
  }

  var ordiniInAttesa = 0;

  /**
   * Salva in coda un nuovo ordine delle schede: calcola(ordineSchede attuale) -> nuovo ordineSchede, eseguita al
   * proprio turno (vede i salvataggi precedenti). Quando non resta nessun cambio d'ordine in coda, mostra(ordineSchede)
   * riceve l'ordine riletto dal database, quello salvato davvero (dopo un errore, quello rimasto); se anche la
   * rilettura fallisce riceve null e chi chiama rimette l'ordine che conosceva prima del gesto.
   * La Promise restituita rifiuta se il salvataggio fallisce.
   */
  function cambiaOrdineSchede(calcola, mostra) {
    ordiniInAttesa++;
    function fine() {
      if (--ordiniInAttesa > 0) return;
      leggi().then(function (imp) { return imp.ordineSchede; }, function () { return null; }).then(function (ordine) {
        // Un cambio arrivato durante la rilettura mostrerà l'ordine quando finisce: niente ordine vecchio per un attimo.
        if (ordiniInAttesa === 0) mostra(ordine);
      }).catch(function (err) { CasaNostra.errori.gestisci(err, 'ordine delle schede'); });
    }
    return aggiorna(function (attuali) {
      return { ordineSchede: calcola(attuali.ordineSchede) };
    }).then(fine, function (err) { fine(); throw err; });
  }

  CasaNostra.impostazioni = {
    ID: ID,
    PREDEFINITE: PREDEFINITE,
    completa: completa,
    leggi: leggi,
    aggiorna: aggiorna,
    schedaVisibile: schedaVisibile,
    spostabile: spostabile,
    ordineEffettivo: ordineEffettivo,
    idSpostabili: idSpostabili,
    ordineConMostrate: ordineConMostrate,
    cambiaOrdineSchede: cambiaOrdineSchede
  };
})(window.CasaNostra);
