/*
 * CasaNostra.impostazioni — lettura e scrittura del record unico delle impostazioni (ADR-0001: in IndexedDB).
 *
 *   CasaNostra.impostazioni.leggi()               -> Promise<impostazioni complete (con i valori predefiniti)>
 *   CasaNostra.impostazioni.aggiorna({ ... })     -> Promise<impostazioni aggiornate> (unione superficiale)
 *   CasaNostra.impostazioni.PREDEFINITE           -> valori predefiniti
 *
 * schedeVisibili: { idScheda: false } nasconde una scheda della dashboard; un id assente = visibile.
 */
(function (CasaNostra) {
  'use strict';

  var ID = 'impostazioni';

  var PREDEFINITE = {
    id: ID,
    nomeVisualizzato: '',
    localita: { nome: 'Fiumicino', latitudine: 41.77, longitudine: 12.23 },
    schedeVisibili: {},
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

  function aggiorna(parziale) {
    return leggi().then(function (attuali) {
      var nuove = completa(Object.assign(attuali, parziale || {}));
      return CasaNostra.db.raccolta('impostazioni').put(nuove);
    });
  }

  /** true se la scheda con questo id va mostrata nella dashboard. */
  function schedaVisibile(impostazioni, idScheda) {
    return !(impostazioni && impostazioni.schedeVisibili && impostazioni.schedeVisibili[idScheda] === false);
  }

  CasaNostra.impostazioni = {
    ID: ID,
    PREDEFINITE: PREDEFINITE,
    completa: completa,
    leggi: leggi,
    aggiorna: aggiorna,
    schedaVisibile: schedaVisibile
  };
})(window.CasaNostra);
