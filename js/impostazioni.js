/*
 * CasaNostra.impostazioni — lettura e scrittura del record unico delle impostazioni (ADR-0001: in IndexedDB).
 *
 *   CasaNostra.impostazioni.leggi()               -> Promise<impostazioni complete (con i valori predefiniti)>
 *   CasaNostra.impostazioni.aggiorna({ ... })     -> Promise<impostazioni aggiornate> (unione superficiale)
 *   CasaNostra.impostazioni.PREDEFINITE           -> valori predefiniti
 *
 *   CasaNostra.impostazioni.ordineEffettivo(schede, impostazioni) -> le definizioni delle schede nell'ordine delle schede
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

  function leggi() {
    return CasaNostra.db.raccolta('impostazioni').get(ID).then(completa);
  }

  var coda = Promise.resolve();

  function aggiorna(parziale) {
    var turno = coda.catch(function () {}).then(leggi).then(function (attuali) {
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

  CasaNostra.impostazioni = {
    ID: ID,
    PREDEFINITE: PREDEFINITE,
    completa: completa,
    leggi: leggi,
    aggiorna: aggiorna,
    schedaVisibile: schedaVisibile,
    ordineEffettivo: ordineEffettivo
  };
})(window.CasaNostra);
