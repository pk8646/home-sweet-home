/*
 * CasaNostra.db — persistenza su IndexedDB.
 *
 * Tutte le raccolte dello schema sono dichiarate qui, in un punto unico, e create già alla versione 1:
 * le sezioni non devono toccare l'upgrade. Ogni raccolta ha chiave `id` (stringa).
 *
 *   var prodotti = CasaNostra.db.raccolta('prodotti');
 *   prodotti.list() / get(id) / put(record) / delete(id) / clear()      -> Promise
 *   CasaNostra.db.replaceAll({ prodotti: [...], appuntamenti: [...] })   -> Promise (una sola transazione)
 *
 * Al primo salvataggio della sessione (put o replaceAll, su qualunque raccolta) chiede al browser l'archiviazione
 * persistente con navigator.storage.persist(), se l'API esiste: in Chrome non mostra alcun prompt.
 *
 * Gli errori sono sempre CasaNostra.db.ErroreDB con `tipo` ('nonDisponibile' | 'quota' | 'bloccato' |
 * 'generico') e `message` già in italiano, pronto da mostrare all'utente.
 */
(function (CasaNostra) {
  'use strict';

  var NOME_DB = 'casa-nostra';
  var VERSIONE_DB = 1;

  /**
   * Schema: le raccolte (impostazioni ha un solo record, foto tiene blob e miniatura nello stesso record).
   * Aggiungere qui (e alzare VERSIONE_DB) solo se serve davvero.
   */
  var RACCOLTE = ['prodotti', 'appuntamenti', 'attivita', 'promemoriaCasa', 'impostazioni', 'foto'];

  /** Le raccolte dei dati strutturati (tutte tranne le foto): quelle del backup dati. */
  var STRUTTURATE = RACCOLTE.filter(function (n) { return n !== 'foto'; });

  var MESSAGGI = {
    nonDisponibile: 'Questo browser non permette di salvare i dati (IndexedDB non disponibile). ' +
      'Se stai usando la navigazione in incognito, apri Casa Nostra in una finestra normale.',
    quota: 'Spazio esaurito: non è stato possibile salvare. Libera spazio sul dispositivo o elimina qualche foto.',
    bloccato: 'Il database è bloccato da un\'altra scheda di Casa Nostra. Chiudi le altre schede e ricarica la pagina.',
    generico: 'Non è stato possibile leggere o salvare i dati.'
  };

  function ErroreDB(tipo, causa) {
    var e = new Error(MESSAGGI[tipo] || MESSAGGI.generico);
    e.name = 'ErroreDB';
    e.tipo = tipo;
    e.causa = causa;
    e.perUtente = true;
    return e;
  }

  /** Traduce un errore IndexedDB/DOMException in ErroreDB. */
  function traduci(err) {
    if (err && err.name === 'ErroreDB') return err;
    var nome = err && err.name;
    if (nome === 'QuotaExceededError') return ErroreDB('quota', err);
    if (nome === 'SecurityError') return ErroreDB('nonDisponibile', err);
    return ErroreDB('generico', err);
  }

  var aperto = null; // Promise<IDBDatabase>

  function apri() {
    if (aperto) return aperto;
    aperto = new Promise(function (risolvi, rifiuta) {
      var idb;
      try { idb = window.indexedDB; } catch (e) { idb = null; }
      if (!idb) return rifiuta(ErroreDB('nonDisponibile'));
      var richiesta;
      try {
        richiesta = idb.open(NOME_DB, VERSIONE_DB);
      } catch (e) {
        return rifiuta(ErroreDB('nonDisponibile', e));
      }
      richiesta.onupgradeneeded = function () {
        var db = richiesta.result;
        RACCOLTE.forEach(function (nome) {
          if (!db.objectStoreNames.contains(nome)) db.createObjectStore(nome, { keyPath: 'id' });
        });
      };
      richiesta.onblocked = function () { rifiuta(ErroreDB('bloccato')); };
      richiesta.onerror = function (ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        var err = richiesta.error;
        rifiuta(err && err.name === 'QuotaExceededError' ? ErroreDB('quota', err) : ErroreDB('nonDisponibile', err));
      };
      richiesta.onsuccess = function () {
        var db = richiesta.result;
        // Un'altra scheda con una versione più nuova chiede l'upgrade: chiudiamo per non bloccarla.
        db.onversionchange = function () { db.close(); aperto = null; };
        risolvi(db);
      };
    });
    aperto.catch(function () { aperto = null; });
    return aperto;
  }

  /**
   * Apre una transazione sulle raccolte `nomi` ed esegue `lavoro(tx)`, che riceve la IDBTransaction e può
   * restituire una IDBRequest. Risolve al completamento della transazione con il risultato di quella richiesta
   * (undefined se non ne restituisce una); rifiuta con un ErroreDB se la transazione viene annullata.
   */
  function transazione(nomi, modo, lavoro) {
    return apri().then(function (db) {
      return new Promise(function (risolvi, rifiuta) {
        var tx;
        try {
          tx = db.transaction(nomi, modo);
        } catch (e) {
          return rifiuta(traduci(e));
        }
        var risultato;
        var richiesta;
        try {
          richiesta = lavoro(tx);
        } catch (e) {
          try { tx.abort(); } catch (e2) { /* già chiusa */ }
          return rifiuta(e && e.name === 'DataError' ? ErroreDB('generico', e) : traduci(e));
        }
        if (richiesta) richiesta.onsuccess = function () { risultato = richiesta.result; };
        tx.oncomplete = function () { risolvi(risultato); };
        tx.onerror = function (ev) { if (ev && ev.preventDefault) ev.preventDefault(); };
        tx.onabort = function () { rifiuta(traduci(tx.error || (richiesta && richiesta.error))); };
      });
    });
  }

  function controllaNome(nome) {
    if (RACCOLTE.indexOf(nome) === -1) throw new Error('Raccolta sconosciuta: ' + nome);
  }

  var persistenzaChiesta = false;

  /** Al primo salvataggio della sessione chiede l'archiviazione persistente (se l'API esiste). Mai bloccante. */
  function chiediPersistenza() {
    if (persistenzaChiesta) return;
    persistenzaChiesta = true;
    var s = navigator.storage;
    if (!s || typeof s.persist !== 'function') return;
    Promise.resolve().then(function () {
      return typeof s.persisted === 'function' ? s.persisted() : false;
    }).then(function (gia) { if (!gia) return s.persist(); })
      .catch(function (e) { CasaNostra.errori.registra(e, 'richiesta di archiviazione persistente'); });
  }

  /** Interfaccia uniforme per una raccolta. */
  function raccolta(nome) {
    controllaNome(nome);
    return {
      nome: nome,
      list: function () {
        return transazione([nome], 'readonly', function (tx) { return tx.objectStore(nome).getAll(); })
          .then(function (r) { return r || []; });
      },
      get: function (id) {
        return transazione([nome], 'readonly', function (tx) { return tx.objectStore(nome).get(id); });
      },
      put: function (record) {
        return transazione([nome], 'readwrite', function (tx) { return tx.objectStore(nome).put(record); })
          .then(function () { chiediPersistenza(); return record; });
      },
      delete: function (id) {
        return transazione([nome], 'readwrite', function (tx) { return tx.objectStore(nome).delete(id); })
          .then(function () {});
      },
      clear: function () {
        return transazione([nome], 'readwrite', function (tx) { return tx.objectStore(nome).clear(); })
          .then(function () {});
      }
    };
  }

  /**
   * Sostituisce il contenuto delle raccolte indicate in un'unica transazione: o tutto o niente.
   * `dati` = { nomeRaccolta: [record...] }. Le raccolte non indicate non vengono toccate.
   */
  function replaceAll(dati) {
    var nomi = Object.keys(dati);
    nomi.forEach(controllaNome);
    return transazione(nomi, 'readwrite', function (tx) {
      nomi.forEach(function (nome) {
        var store = tx.objectStore(nome);
        store.clear();
        (dati[nome] || []).forEach(function (r) { store.put(r); });
      });
      return null;
    }).then(function () { chiediPersistenza(); });
  }

  CasaNostra.db = {
    NOME_DB: NOME_DB,
    VERSIONE_DB: VERSIONE_DB,
    RACCOLTE: RACCOLTE.slice(),
    STRUTTURATE: STRUTTURATE.slice(),
    apri: apri,
    raccolta: raccolta,
    replaceAll: replaceAll,
    traduciErrore: traduci,
    ErroreDB: ErroreDB,
    MESSAGGI: MESSAGGI
  };
})(window.CasaNostra);
