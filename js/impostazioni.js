/*
 * CasaNostra.impostazioni — lettura e scrittura del record unico delle impostazioni (ADR-0001: in IndexedDB).
 *
 *   CasaNostra.impostazioni.leggi()               -> Promise<impostazioni complete (con i valori predefiniti)>
 *   CasaNostra.impostazioni.aggiorna({ ... })     -> Promise<impostazioni aggiornate> (unione superficiale)
 *   CasaNostra.impostazioni.PREDEFINITE           -> valori predefiniti
 *
 *   CasaNostra.impostazioni.ordineEffettivo(schede, impostazioni) -> le definizioni delle schede nell'ordine delle schede
 *   CasaNostra.impostazioni.idSpostabili(schede, impostazioni)    -> gli id delle schede spostabili nell'ordine delle schede
 *   CasaNostra.impostazioni.ordineConMostrate(schede, impostazioni, mostrate) -> ordine completo da salvare dopo un riordino
 *   CasaNostra.impostazioni.cambiaOrdineSchede(calcola, mostra) -> Promise: salva in coda un nuovo ordine delle schede
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

  /**
   * Le schede (definizioni, nell'ordine predefinito) nell'ordine delle schede: prima le schede fisse
   * (nascondibile: false), poi quelle di impostazioni.ordineSchede nell'ordine salvato, poi le altre nell'ordine
   * predefinito. Id sconosciuti, ripetuti o di schede fisse vengono ignorati.
   */
  function ordineEffettivo(schede, impostazioni) {
    var fisse = schede.filter(function (def) { return def.nascondibile === false; });
    var spostabili = {};
    schede.forEach(function (def) { if (def.nascondibile !== false) spostabili[def.id] = def; });
    var salvato = impostazioni && Array.isArray(impostazioni.ordineSchede) ? impostazioni.ordineSchede : [];
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
  function idSpostabili(schede, impostazioni) {
    return ordineEffettivo(schede, impostazioni)
      .filter(function (def) { return def.nascondibile !== false; })
      .map(function (def) { return def.id; });
  }

  /**
   * L'ordine completo delle schede spostabili (id, nascoste comprese) dopo che le schede `mostrate` (id) sono
   * state messe in quest'ordine. Ogni scheda non mostrata resta attaccata alla scheda mostrata che la precede
   * nell'ordine attuale; quelle prima della prima scheda mostrata restano in testa. Id ignoti o fissi sono ignorati.
   */
  function ordineConMostrate(schede, impostazioni, mostrate) {
    var attuale = idSpostabili(schede, impostazioni);
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
  var ultimeSalvate = null; // le impostazioni nel database dopo l'ultimo cambio d'ordine finito

  /**
   * Salva in coda un nuovo ordine delle schede: calcola(impostazioni attuali) -> ordineSchede, eseguita al proprio
   * turno (vede i salvataggi precedenti). Quando non resta nessun cambio d'ordine in coda, mostra(impostazioni) riceve
   * subito le impostazioni salvate davvero: se un salvataggio è fallito, chi chiama rimette sullo schermo l'ordine
   * di prima. La Promise restituita rifiuta se il salvataggio fallisce.
   */
  function cambiaOrdineSchede(calcola, mostra) {
    ordiniInAttesa++;
    var prima = null;
    var dopo = null;
    function fine(salvate) {
      if (salvate) ultimeSalvate = salvate;
      if (--ordiniInAttesa === 0 && ultimeSalvate) mostra(copia(ultimeSalvate));
    }
    return aggiorna(function (attuali) {
      prima = attuali;
      dopo = completa(Object.assign(copia(attuali), { ordineSchede: calcola(copia(attuali)) }));
      return { ordineSchede: dopo.ordineSchede };
    }).then(function () { fine(dopo); }, function (err) { fine(prima); throw err; });
  }

  CasaNostra.impostazioni = {
    ID: ID,
    PREDEFINITE: PREDEFINITE,
    completa: completa,
    leggi: leggi,
    aggiorna: aggiorna,
    schedaVisibile: schedaVisibile,
    ordineEffettivo: ordineEffettivo,
    idSpostabili: idSpostabili,
    ordineConMostrate: ordineConMostrate,
    cambiaOrdineSchede: cambiaOrdineSchede
  };
})(window.CasaNostra);
