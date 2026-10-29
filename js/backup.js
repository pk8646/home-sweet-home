/*
 * CasaNostra.backup — Backup dati (ticket #11): esportazione, validazione e importazione del file JSON,
 * regola del promemoria di backup e ripristino iniziale. Solo logica: l'interfaccia (gruppi "Backup dati" e
 * "Ripristino iniziale", scheda "Promemoria backup") sta in js/sezioni/backup.js. L'archivio foto (ZIP) sta in
 * js/archivio-foto.js (#10).
 *
 * Contratto del file: { app: 'casa-nostra', schemaVersion: 1, esportatoIl: ISO,
 *   dati: { prodotti, appuntamenti, attivita, promemoriaCasa, impostazioni } } — le foto sono escluse.
 *
 *   CasaNostra.backup.costruisci()        -> Promise<backup>  (oggetto pronto da serializzare)
 *   CasaNostra.backup.esporta()           -> Promise<backup>  (scarica il file e aggiorna ultimoBackup)
 *   CasaNostra.backup.leggiFile(file)     -> Promise<testo del file scelto>
 *   CasaNostra.backup.leggi(testo)        -> backup validato e migrato; lancia un errore perUtente al primo problema
 *   CasaNostra.backup.riepilogo(backup)   -> { esportatoIl, conteggi: { raccolta: n } }
 *   CasaNostra.backup.importa(backup)     -> Promise (una sola transazione su tutte le raccolte strutturate; foto intatte)
 *   CasaNostra.backup.ripristinoIniziale() -> Promise (cancella dati, impostazioni, foto e LocalStorage dell'app)
 *   CasaNostra.backup.giorniDallUltimo(ultimoBackup, adesso) -> giorni | null (mai fatto)
 *   CasaNostra.backup.promemoriaDovuto(impostazioni, adesso) -> Promise<null | { giorni: n | null }>
 *   CasaNostra.backup.posticipaPromemoria(adesso)            -> Promise (nasconde il promemoria per GIORNI_POSTICIPO giorni)
 */
(function (CasaNostra) {
  'use strict';

  var date = CasaNostra.date;

  var APP = 'casa-nostra';
  var SCHEMA = 1;
  var RACCOLTE = CasaNostra.db.STRUTTURATE;
  var NOMI = {
    prodotti: 'Prodotti', appuntamenti: 'Appuntamenti', attivita: 'Attività',
    promemoriaCasa: 'Promemoria casa', impostazioni: 'Impostazioni'
  };
  var GIORNI_AVVISO = 30;
  var GIORNI_POSTICIPO = 7;

  // ---------- esportazione ----------

  function costruisci(adesso) {
    var esportatoIl = (adesso || new Date()).toISOString();
    var dati = {};
    return Promise.all(RACCOLTE.map(function (nome) {
      if (nome === 'impostazioni') {
        return CasaNostra.impostazioni.leggi().then(function (imp) {
          // Il file descrive lo stato dopo questo backup: reimportandolo i dati tornano identici.
          imp.ultimoBackup = esportatoIl;
          dati.impostazioni = [imp];
        });
      }
      return CasaNostra.db.raccolta(nome).list().then(function (lista) { dati[nome] = lista; });
    })).then(function () {
      var ordinati = {};
      RACCOLTE.forEach(function (n) { ordinati[n] = dati[n]; });
      return { app: APP, schemaVersion: SCHEMA, esportatoIl: esportatoIl, dati: ordinati };
    });
  }

  function esporta() {
    var adesso = new Date();
    return costruisci(adesso).then(function (backup) {
      var blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      CasaNostra.ui.scaricaBlob(blob, 'casa-nostra-backup-' + date.oggi(adesso) + '.json');
      return CasaNostra.impostazioni.aggiorna({ ultimoBackup: backup.esportatoIl }).then(function () { return backup; });
    });
  }

  // ---------- validazione (tutta prima di qualsiasi scrittura) ----------

  /*
   * Tipi dei campi: 'testo' (non vuoto), 'booleano', 'data' (AAAA-MM-GG), 'istante' (data e ora ISO), 'ora' (HH:MM),
   * 'intero' (> 0), 'categoria', 'localita', 'oggetto'. Il suffisso '?' rende il campo facoltativo (assente o null;
   * per testo, data e ora anche la stringa vuota). I campi non elencati vengono conservati così come sono.
   */
  var CAMPI = {
    prodotti: { nome: 'testo', acquistato: 'booleano', creatoIl: 'istante?', acquistatoIl: 'istante?' },
    appuntamenti: { titolo: 'testo', data: 'data', ora: 'ora?', note: 'testo?', creatoIl: 'istante?' },
    attivita: { titolo: 'testo', nota: 'testo?', completata: 'booleano', creataIl: 'istante?', completataIl: 'istante?' },
    promemoriaCasa: {
      titolo: 'testo', categoria: 'categoria', data: 'data?', note: 'testo?', intervalloGiorni: 'intero?',
      completato: 'booleano', ultimoCompletamento: 'data?', creatoIl: 'istante?'
    },
    impostazioni: {
      nomeVisualizzato: 'testo?', localita: 'localita?', schedeVisibili: 'oggetto?', schermoAcceso: 'booleano?',
      ultimoBackup: 'istante?', benvenutoVisto: 'booleano?', avvisoBackupPosticipatoFino: 'data?'
    }
  };

  var CATEGORIE = CasaNostra.dominio.casa.CATEGORIE.map(function (c) { return c.valore; });

  var DESCRIZIONI = {
    testo: 'deve essere un testo non vuoto',
    booleano: 'deve essere vero o falso',
    data: 'non è una data valida (AAAA-MM-GG)',
    istante: 'non è una data e ora valida',
    ora: 'non è un\'ora valida (HH:MM)',
    intero: 'deve essere un numero intero maggiore di zero',
    categoria: 'non è una categoria valida',
    localita: 'deve avere nome, latitudine e longitudine',
    oggetto: 'deve essere un oggetto'
  };

  var RE_ISTANTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

  function istanteValido(v) {
    return typeof v === 'string' && RE_ISTANTE.test(v) && date.valida(v.slice(0, 10)) && !isNaN(Date.parse(v));
  }

  function eOggetto(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

  function valoreValido(tipo, v) {
    switch (tipo) {
      case 'testo': return typeof v === 'string' && v.trim() !== '';
      case 'booleano': return typeof v === 'boolean';
      case 'data': return typeof v === 'string' && date.valida(v);
      case 'istante': return istanteValido(v);
      case 'ora': return typeof v === 'string' && date.oraValida(v);
      case 'intero': return typeof v === 'number' && Math.floor(v) === v && v > 0;
      case 'categoria': return CATEGORIE.indexOf(v) >= 0;
      case 'localita': return eOggetto(v) && typeof v.nome === 'string' &&
        typeof v.latitudine === 'number' && isFinite(v.latitudine) && typeof v.longitudine === 'number' && isFinite(v.longitudine);
      case 'oggetto': return eOggetto(v);
    }
    return false;
  }

  function nonValido(messaggio) {
    return CasaNostra.errori.perUtente('Backup non valido: ' + messaggio);
  }

  function controllaRecord(nome, record, indice, visti) {
    var dove = 'in «' + NOMI[nome] + '», elemento ' + (indice + 1);
    if (!eOggetto(record)) throw nonValido(dove + ' non è un oggetto.');
    if (typeof record.id !== 'string' || record.id === '') throw nonValido(dove + ': manca l\'identificativo («id»).');
    dove += ' (id «' + record.id + '»)';
    if (Object.prototype.hasOwnProperty.call(visti, record.id)) {
      throw nonValido(dove + ': l\'identificativo è già usato dall\'elemento ' + visti[record.id] + '.');
    }
    visti[record.id] = indice + 1;
    if (nome === 'impostazioni' && record.id !== CasaNostra.impostazioni.ID) {
      throw nonValido(dove + ': l\'identificativo delle impostazioni deve essere «' + CasaNostra.impostazioni.ID + '».');
    }
    var campi = CAMPI[nome];
    Object.keys(campi).forEach(function (campo) {
      var tipo = campi[campo];
      var facoltativo = tipo.charAt(tipo.length - 1) === '?';
      if (facoltativo) tipo = tipo.slice(0, -1);
      var v = record[campo];
      if (v === undefined || v === null || (facoltativo && v === '' && /^(testo|data|ora)$/.test(tipo))) {
        if (facoltativo) return;
        throw nonValido(dove + ': manca il campo «' + campo + '».');
      }
      if (!valoreValido(tipo, v)) throw nonValido(dove + ': il campo «' + campo + '» ' + DESCRIZIONI[tipo] + '.');
    });
  }

  /*
   * Migrazioni delle versioni precedenti: MIGRAZIONI[n] trasforma un backup della versione n nella versione n + 1.
   * Quando si aggiunge una raccolta o si cambia un record: alzare SCHEMA e aggiungere qui la funzione per la versione vecchia.
   */
  var MIGRAZIONI = {};

  function migra(backup) {
    var b = backup;
    for (var v = b.schemaVersion; v < SCHEMA; v++) {
      if (!MIGRAZIONI[v]) throw nonValido('la versione ' + v + ' del formato non è più supportata.');
      b = MIGRAZIONI[v](b);
      b.schemaVersion = v + 1;
    }
    return b;
  }

  /** Legge e valida il testo di un file di backup. Restituisce il backup (migrato alla versione attuale). */
  function leggi(testo) {
    var b;
    try {
      b = JSON.parse(testo);
    } catch (e) {
      throw CasaNostra.errori.perUtente('Il file non è un backup valido: non è un file JSON leggibile (forse è danneggiato).');
    }
    if (!eOggetto(b) || b.app !== APP) {
      throw CasaNostra.errori.perUtente('Questo file non è un backup dati di Casa Nostra.');
    }
    var v = b.schemaVersion;
    if (typeof v !== 'number' || Math.floor(v) !== v || v < 1) throw nonValido('la versione del formato («schemaVersion») non è valida.');
    if (v > SCHEMA) {
      throw CasaNostra.errori.perUtente('Questo backup è stato creato da una versione più recente di Casa Nostra (formato ' + v +
        '): aggiorna l\'app prima di importarlo.');
    }
    b = migra(b);
    if (!istanteValido(b.esportatoIl)) throw nonValido('la data di esportazione («esportatoIl») non è valida.');
    if (!eOggetto(b.dati)) throw nonValido('manca la sezione «dati».');
    RACCOLTE.forEach(function (nome) {
      var lista = b.dati[nome];
      if (lista === undefined) throw nonValido('manca la raccolta «' + NOMI[nome] + '».');
      if (!Array.isArray(lista)) throw nonValido('la raccolta «' + NOMI[nome] + '» non è un elenco.');
      if (nome === 'impostazioni' && lista.length > 1) throw nonValido('«Impostazioni» deve contenere un solo elemento.');
      var visti = {};
      lista.forEach(function (r, i) { controllaRecord(nome, r, i, visti); });
    });
    return b;
  }

  /** Testo del file scelto dall'utente (con ripiego su FileReader). */
  function leggiFile(file) {
    if (typeof file.text === 'function') return file.text();
    return new Promise(function (risolvi, rifiuta) {
      var r = new FileReader();
      r.onload = function () { risolvi(String(r.result)); };
      r.onerror = function () { rifiuta(CasaNostra.errori.perUtente('Non è stato possibile leggere il file.')); };
      r.readAsText(file);
    });
  }

  // ---------- riepilogo e importazione ----------

  function riepilogo(backup) {
    var conteggi = {};
    RACCOLTE.forEach(function (n) { conteggi[n] = backup.dati[n].length; });
    return { esportatoIl: backup.esportatoIl, conteggi: conteggi };
  }

  /** Sostituisce tutte le raccolte strutturate in un'unica transazione. La raccolta foto non è inclusa. */
  function importa(backup) {
    var dati = {};
    RACCOLTE.forEach(function (n) { dati[n] = backup.dati[n]; });
    return CasaNostra.db.replaceAll(dati);
  }

  // ---------- ripristino iniziale ----------

  function ripristinoIniziale() {
    var vuote = {};
    CasaNostra.db.RACCOLTE.forEach(function (n) { vuote[n] = []; });
    return CasaNostra.db.replaceAll(vuote).then(function () {
      // Anche la copia del meteo in LocalStorage: l'app torna davvero allo stato del primo avvio.
      try {
        var chiavi = [];
        for (var i = 0; i < window.localStorage.length; i++) {
          var k = window.localStorage.key(i);
          if (k && k.indexOf(CasaNostra.PREFISSO_LOCALSTORAGE) === 0) chiavi.push(k);
        }
        chiavi.forEach(function (k) { window.localStorage.removeItem(k); });
      } catch (e) {
        CasaNostra.errori.registra(e, 'pulizia di LocalStorage');
      }
    });
  }

  // ---------- ultimo backup e promemoria di backup ----------

  /** Giorni trascorsi dall'ultimo backup (ISO) a oggi, o null se non c'è mai stato. */
  function giorniDallUltimo(ultimoBackup, adesso) {
    if (!ultimoBackup) return null;
    var t = new Date(ultimoBackup);
    if (isNaN(t.getTime())) return null;
    return Math.max(0, date.differenzaGiorni(date.oggi(t), date.oggi(adesso || new Date())));
  }

  /** true se c'è almeno un dato dell'utente (le impostazioni non contano). */
  function ciSonoDati() {
    return Promise.all(RACCOLTE.filter(function (n) { return n !== 'impostazioni'; }).map(function (n) {
      return CasaNostra.db.raccolta(n).list();
    })).then(function (liste) {
      return liste.some(function (l) { return l.length > 0; });
    });
  }

  /**
   * Il promemoria di backup serve se ci sono dati, non è posticipato e l'ultimo backup ha più di 30 giorni
   * (o non c'è mai stato). Risolve con null se non serve, altrimenti con { giorni } (null = mai fatto).
   */
  function promemoriaDovuto(imp, adesso) {
    var oggi = date.oggi(adesso);
    if (imp.avvisoBackupPosticipatoFino && oggi < imp.avvisoBackupPosticipatoFino) return Promise.resolve(null);
    var n = giorniDallUltimo(imp.ultimoBackup, adesso);
    if (n !== null && n <= GIORNI_AVVISO) return Promise.resolve(null);
    return ciSonoDati().then(function (dati) { return dati ? { giorni: n } : null; });
  }

  function posticipaPromemoria(adesso) {
    var fino = date.aggiungiGiorni(date.oggi(adesso || new Date()), GIORNI_POSTICIPO);
    return CasaNostra.impostazioni.aggiorna({ avvisoBackupPosticipatoFino: fino });
  }

  CasaNostra.backup = {
    APP: APP,
    SCHEMA: SCHEMA,
    RACCOLTE: RACCOLTE,
    GIORNI_POSTICIPO: GIORNI_POSTICIPO,
    costruisci: costruisci,
    esporta: esporta,
    leggiFile: leggiFile,
    leggi: leggi,
    riepilogo: riepilogo,
    importa: importa,
    ripristinoIniziale: ripristinoIniziale,
    giorniDallUltimo: giorniDallUltimo,
    promemoriaDovuto: promemoriaDovuto,
    posticipaPromemoria: posticipaPromemoria
  };
})(window.CasaNostra);
