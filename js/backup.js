/*
 * CasaNostra.backup — Backup dati (ticket #11): esportazione, validazione e importazione del file JSON,
 * promemoria di backup sulla dashboard e ripristino iniziale. L'archivio foto (ZIP) sta in un file suo (#10).
 *
 * Contratto del file: { app: 'casa-nostra', schemaVersion: 1, esportatoIl: ISO,
 *   dati: { prodotti, appuntamenti, attivita, promemoriaCasa, impostazioni } } — le foto sono escluse.
 *
 *   CasaNostra.backup.costruisci()        -> Promise<backup>  (oggetto pronto da serializzare)
 *   CasaNostra.backup.esporta()           -> Promise<backup>  (scarica il file e aggiorna ultimoBackup)
 *   CasaNostra.backup.leggi(testo)        -> backup validato e migrato; lancia un errore perUtente al primo problema
 *   CasaNostra.backup.riepilogo(backup)   -> { esportatoIl, conteggi: { raccolta: n } }
 *   CasaNostra.backup.importa(backup)     -> Promise (una sola transazione su tutte le raccolte strutturate; foto intatte)
 *   CasaNostra.backup.ripristinoIniziale() -> Promise (cancella dati, impostazioni, foto e la copia del meteo)
 */
(function (CasaNostra) {
  'use strict';

  var ui = CasaNostra.ui;
  var date = CasaNostra.date;

  var APP = 'casa-nostra';
  var SCHEMA = 1;
  var RACCOLTE = ['prodotti', 'appuntamenti', 'attivita', 'promemoriaCasa', 'impostazioni'];
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

  function scaricaTesto(testo, nome) {
    var blob = new Blob([testo], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = ui.el('a', { href: url, download: nome, hidden: true });
    document.body.appendChild(link);
    link.click();
    link.parentNode.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  function esporta() {
    var adesso = new Date();
    return costruisci(adesso).then(function (backup) {
      scaricaTesto(JSON.stringify(backup, null, 2), 'casa-nostra-backup-' + date.oggi(adesso) + '.json');
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
      titolo: 'testo', categoria: 'categoria', data: 'data?', note: 'testo?', intervallo: 'intero?',
      completato: 'booleano', ultimoCompletamento: 'data?', creatoIl: 'istante?'
    },
    impostazioni: {
      nomeVisualizzato: 'testo?', localita: 'localita?', schedeVisibili: 'oggetto?', schermoAcceso: 'booleano?',
      ultimoBackup: 'istante?', benvenutoVisto: 'booleano?', avvisoBackupPosticipatoFino: 'data?'
    }
  };

  var CATEGORIE = ['manutenzione', 'scadenza', 'controllo', 'altro'];

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

  // ---------- riepilogo e importazione ----------

  var ETICHETTE = {
    prodotti: ['prodotto', 'prodotti'], appuntamenti: ['appuntamento', 'appuntamenti'], attivita: ['attività', 'attività'],
    promemoriaCasa: ['promemoria casa', 'promemoria casa']
  };

  function riepilogo(backup) {
    var conteggi = {};
    RACCOLTE.forEach(function (n) { conteggi[n] = backup.dati[n].length; });
    return { esportatoIl: backup.esportatoIl, conteggi: conteggi };
  }

  function testoRiepilogo(backup) {
    var r = riepilogo(backup);
    var t = new Date(r.esportatoIl);
    var parti = Object.keys(ETICHETTE).map(function (n) {
      var c = r.conteggi[n];
      return c + ' ' + ETICHETTE[n][c === 1 ? 0 : 1];
    });
    return 'Backup del ' + date.formattaBreve(date.oggi(t)) + ' alle ' + date.ora(t) + ': ' + parti.join(', ') +
      (r.conteggi.impostazioni ? ' e le impostazioni' : '') + '. ' +
      'Tutti i dati attuali (spesa, agenda, attività, promemoria casa e impostazioni) verranno sostituiti. Le foto non vengono toccate.';
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
          if (k && k.indexOf('casaNostra.') === 0) chiavi.push(k);
        }
        chiavi.forEach(function (k) { window.localStorage.removeItem(k); });
      } catch (e) {
        CasaNostra.errori.registra(e, 'pulizia di LocalStorage');
      }
    });
  }

  // ---------- ultimo backup ----------

  /** Giorni trascorsi dall'ultimo backup (ISO) a oggi, o null se non c'è mai stato. */
  function giorniDallUltimo(ultimoBackup, adesso) {
    if (!ultimoBackup) return null;
    var t = new Date(ultimoBackup);
    if (isNaN(t.getTime())) return null;
    return Math.max(0, date.differenzaGiorni(date.oggi(t), date.oggi(adesso || new Date())));
  }

  function testoUltimo(ultimoBackup, adesso) {
    var n = giorniDallUltimo(ultimoBackup, adesso);
    if (n === null) return 'mai';
    if (n === 0) return 'oggi';
    if (n === 1) return 'ieri';
    return n + ' giorni fa';
  }

  // ---------- interfaccia: gruppo "Backup dati" ----------

  ui.registraGruppoImpostazioni({
    id: 'backup', titolo: 'Backup dati', ordine: 60,
    disegna: function (corpo, contesto) {
      return CasaNostra.impostazioni.leggi().then(function (imp) {
        var ultimo = ui.el('p', { class: 'backup-ultimo', testo: 'Ultimo backup: ' + testoUltimo(imp.ultimoBackup, contesto && contesto.adesso) });
        corpo.appendChild(ultimo);
        corpo.appendChild(ui.el('p', { class: 'aiuto', testo: 'Il backup dati è un file JSON con spesa, agenda, attività, ' +
          'promemoria casa e impostazioni. Non contiene le foto: per salvarle usa l\'archivio foto.' }));
        corpo.appendChild(ui.el('button', {
          type: 'button', class: 'pulsante pulsante-primario', testo: 'Esporta il backup dati',
          on: { click: CasaNostra.errori.protetta(function () {
            return esporta().then(function (backup) {
              ultimo.textContent = 'Ultimo backup: ' + testoUltimo(backup.esportatoIl);
              ui.toast('Backup dati esportato.', { tipo: 'successo' });
            });
          }, 'esportazione del backup dati') }
        }));
        corpo.appendChild(campoImportazione());
        corpo.appendChild(ui.el('p', { class: 'aiuto', testo: 'Conserva i backup anche fuori dal tablet: copiali sul PC con il cavo USB, ' +
          'inviali per email a te stesso o salvali nel tuo cloud personale.' }));
      });
    }
  });

  function campoImportazione() {
    var id = 'backup-importa';
    var campo = ui.el('input', { id: id, type: 'file', accept: '.json,application/json', class: 'backup-file' });
    var errore = ui.el('p', { class: 'backup-errore', role: 'alert', hidden: true });
    function mostraErrore(testo) {
      errore.textContent = testo || '';
      errore.hidden = !testo;
    }
    campo.addEventListener('change', CasaNostra.errori.protetta(function () {
      var file = campo.files && campo.files[0];
      campo.value = '';
      mostraErrore(null);
      if (!file) return;
      return leggiFile(file).then(function (testo) {
        var backup;
        try {
          backup = leggi(testo);
        } catch (err) {
          CasaNostra.errori.registra(err, 'validazione del backup dati');
          mostraErrore(CasaNostra.errori.messaggio(err));
          return;
        }
        return CasaNostra.dialoghi.conferma({
          titolo: 'Importare il backup dati?', messaggio: testoRiepilogo(backup), testoConferma: 'Importa'
        }).then(function (ok) {
          if (!ok) return;
          return importa(backup).then(function () {
            return CasaNostra.impostazioni.leggi();
          }).then(function (imp) {
            ui.impostaNomeCasa(imp.nomeVisualizzato);
            ui.toast('Backup dati importato.', { tipo: 'successo' });
            return ui.ridisegna();
          });
        });
      });
    }, 'importazione del backup dati'));
    return ui.el('div', { class: 'backup-importazione' }, [
      ui.el('label', { class: 'etichetta', for: id, testo: 'Importa un backup dati' }),
      campo,
      ui.el('p', { class: 'aiuto', testo: 'Prima di sostituire i dati attuali vedrai un riepilogo e ti verrà chiesta conferma.' }),
      errore
    ]);
  }

  function leggiFile(file) {
    if (typeof file.text === 'function') return file.text();
    return new Promise(function (risolvi, rifiuta) {
      var r = new FileReader();
      r.onload = function () { risolvi(String(r.result)); };
      r.onerror = function () { rifiuta(CasaNostra.errori.perUtente('Non è stato possibile leggere il file.')); };
      r.readAsText(file);
    });
  }

  // ---------- interfaccia: promemoria di backup sulla dashboard ----------

  function ciSonoDati() {
    return Promise.all(['prodotti', 'appuntamenti', 'attivita', 'promemoriaCasa'].map(function (n) {
      return CasaNostra.db.raccolta(n).list();
    })).then(function (liste) {
      return liste.some(function (l) { return l.length > 0; });
    });
  }

  /** Testo dell'avviso, o null se non serve: ci sono dati e l'ultimo backup ha più di 30 giorni (o non c'è). */
  function testoAvviso(imp, adesso) {
    var oggi = date.oggi(adesso);
    if (imp.avvisoBackupPosticipatoFino && oggi < imp.avvisoBackupPosticipatoFino) return null;
    var n = giorniDallUltimo(imp.ultimoBackup, adesso);
    if (n === null) return 'Non hai ancora fatto un backup dei dati. Se il browser viene ripulito, spesa, agenda e promemoria vanno persi.';
    if (n > GIORNI_AVVISO) return 'L\'ultimo backup dei dati risale a ' + n + ' giorni fa.';
    return null;
  }

  ui.registraScheda({
    id: 'avviso-backup', titolo: 'Promemoria backup', icona: '💾', ordine: 2, nascondibile: false, dipendeDallaData: true,
    disegna: function (corpo, contesto) {
      return CasaNostra.impostazioni.leggi().then(function (imp) {
        var testo = testoAvviso(imp, contesto.adesso);
        if (!testo) return false;
        return ciSonoDati().then(function (dati) {
          if (!dati) return false;
          corpo.appendChild(ui.el('p', { class: 'avviso-backup-testo', testo: testo }));
          corpo.appendChild(ui.el('div', { class: 'avviso-backup-azioni' }, [
            ui.el('a', { class: 'pulsante pulsante-primario', href: '#/impostazioni', testo: 'Fai il backup' }),
            ui.el('button', {
              type: 'button', class: 'pulsante pulsante-secondario', testo: 'Ricordamelo fra ' + GIORNI_POSTICIPO + ' giorni',
              on: { click: CasaNostra.errori.protetta(function () {
                var fino = date.aggiungiGiorni(date.oggi(new Date()), GIORNI_POSTICIPO);
                return CasaNostra.impostazioni.aggiorna({ avvisoBackupPosticipatoFino: fino }).then(function () {
                  return contesto.ridisegna();
                });
              }, 'posticipo dell\'avviso di backup') }
            })
          ]));
        });
      });
    }
  });

  // ---------- interfaccia: gruppo "Ripristino iniziale" ----------

  ui.registraGruppoImpostazioni({
    id: 'ripristino', titolo: 'Ripristino iniziale', ordine: 90,
    disegna: function (corpo) {
      corpo.appendChild(ui.el('p', { class: 'aiuto', testo: 'Cancella tutto da questo dispositivo: spesa, agenda, attività, ' +
        'promemoria casa, impostazioni e foto. Prima esporta il backup dati e l\'archivio foto.' }));
      corpo.appendChild(ui.el('button', {
        type: 'button', class: 'pulsante pulsante-pericolo', testo: 'Cancella tutto',
        on: { click: CasaNostra.errori.protetta(function () {
          return CasaNostra.dialoghi.conferma({
            titolo: 'Cancellare tutto?',
            messaggio: 'Verranno eliminati definitivamente tutti i dati, le impostazioni e le foto. Non si può annullare: ' +
              'se non l\'hai ancora fatto, esporta prima il backup dati e l\'archivio foto.',
            testoConferma: 'Cancella tutto', pericolo: true, richiediTesto: 'CANCELLA'
          }).then(function (ok) {
            if (!ok) return;
            return ripristinoIniziale().then(function () {
              history.replaceState(null, '', location.pathname + location.search + '#/');
              location.reload();
            });
          });
        }, 'ripristino iniziale') }
      }));
    }
  });

  CasaNostra.backup = {
    APP: APP,
    SCHEMA: SCHEMA,
    RACCOLTE: RACCOLTE,
    costruisci: costruisci,
    esporta: esporta,
    leggi: leggi,
    riepilogo: riepilogo,
    importa: importa,
    ripristinoIniziale: ripristinoIniziale,
    giorniDallUltimo: giorniDallUltimo
  };
})(window.CasaNostra);
