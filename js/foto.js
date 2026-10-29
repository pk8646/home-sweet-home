/*
 * CasaNostra.foto — Foto: decodifica, ridimensionamento, miniature, salvataggio in IndexedDB e URL temporanei.
 * Nessuna richiesta di rete: tutto resta sul dispositivo.
 *
 * Record nella raccolta 'foto' (blob e miniatura nello stesso record: o si salva tutto o niente):
 *   { id, nome, tipo, larghezza, altezza, dimensione, aggiuntaIl: ISO, blob: Blob, miniatura: Blob }
 *
 * Lettura (per galleria, Presentazione #9, Archivio foto #10):
 *   elenco()            -> Promise<[metadati + miniatura, SENZA blob]> dalla più recente
 *   leggi(id)           -> Promise<record completo | undefined>
 *   blobPieno(id)       -> Promise<Blob | null>
 *   conta()             -> Promise<number>
 * Scrittura:
 *   aggiungiFile(fileList, { dopoOgni(esito) })  -> Promise<{ aggiunte: [metadati], scartate: [{ nome, motivo }], erroreQuota }>
 *   aggiungiElaborata({ id, nome, blob, tipo?, aggiuntaIl?, miniatura?, larghezza?, altezza? })
 *                       -> Promise<metadati>  (foto già elaborata, es. dall'archivio: non viene ricompressa)
 *   rigeneraMiniatura(id) -> Promise<metadati>
 *   elimina(id)         -> Promise
 * Elaborazione pura (senza salvare): elabora(file) -> Promise<{ blob, miniatura, nome, tipo, larghezza, altezza }>
 *   creaMiniatura(blob) -> Promise<Blob>
 * URL temporanei: var urls = CasaNostra.foto.gruppoUrl(); urls.crea(blob); urls.revoca(url); urls.revocaTutti();
 */
(function (CasaNostra) {
  'use strict';

  var LATO_MASSIMO = 1200;
  var LATO_MINIATURA = 300;
  var QUALITA = 0.85;
  var QUALITA_MINIATURA = 0.8;
  var TIPI_INTATTI = ['image/jpeg', 'image/png', 'image/webp'];

  var MOTIVI = {
    nonImmagine: 'non è un\'immagine',
    danneggiato: 'file danneggiato o non leggibile'
  };

  function raccolta() { return CasaNostra.db.raccolta('foto'); }

  function errore(motivo) {
    var e = new Error(MOTIVI[motivo]);
    e.name = 'ErroreFoto';
    e.motivo = motivo;
    e.perUtente = true;
    return e;
  }

  // ---------- decodifica e disegno ----------

  /** Decodifica un Blob in qualcosa di disegnabile: { sorgente, larghezza, altezza, chiudi() }. */
  function decodifica(blob) {
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(blob).then(function (bmp) {
        return { sorgente: bmp, larghezza: bmp.width, altezza: bmp.height, chiudi: function () { bmp.close(); } };
      }, function () { throw errore('danneggiato'); });
    }
    return new Promise(function (risolvi, rifiuta) {
      var url = URL.createObjectURL(blob);
      var im = new Image();
      im.onload = function () {
        URL.revokeObjectURL(url);
        risolvi({ sorgente: im, larghezza: im.naturalWidth, altezza: im.naturalHeight, chiudi: function () {} });
      };
      im.onerror = function () { URL.revokeObjectURL(url); rifiuta(errore('danneggiato')); };
      im.src = url;
    });
  }

  /** Disegna l'immagine con il lato lungo ridotto a `lato` (mai ingrandita) e la codifica in JPEG. */
  function ridisegna(imm, lato, qualita) {
    var scala = Math.min(1, lato / Math.max(imm.larghezza, imm.altezza));
    var l = Math.max(1, Math.round(imm.larghezza * scala));
    var a = Math.max(1, Math.round(imm.altezza * scala));
    var canvas = document.createElement('canvas');
    canvas.width = l;
    canvas.height = a;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; // le trasparenze diventano bianche, non nere
    ctx.fillRect(0, 0, l, a);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(imm.sorgente, 0, 0, l, a);
    return new Promise(function (risolvi, rifiuta) {
      canvas.toBlob(function (b) {
        canvas.width = canvas.height = 0;
        if (b) risolvi({ blob: b, larghezza: l, altezza: a });
        else rifiuta(errore('danneggiato'));
      }, 'image/jpeg', qualita);
    });
  }

  function nomeJpeg(nome) {
    var base = String(nome || 'foto').replace(/\.[^.\/\\]*$/, '') || 'foto';
    return base + '.jpg';
  }

  function sembraImmagine(file) {
    var tipo = file && file.type;
    if (tipo) return /^image\//.test(tipo);
    return /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i.test((file && file.name) || '');
  }

  /**
   * Elabora un file scelto dall'utente: oltre LATO_MASSIMO px (o formato non JPEG/PNG/WebP) diventa JPEG 0.85,
   * altrimenti il file resta intatto. Genera sempre la miniatura.
   */
  function elabora(file) {
    if (!sembraImmagine(file)) return Promise.reject(errore('nonImmagine'));
    return decodifica(file).then(function (imm) {
      var intatta = Math.max(imm.larghezza, imm.altezza) <= LATO_MASSIMO && TIPI_INTATTI.indexOf(file.type) !== -1;
      var piena = intatta
        ? Promise.resolve({ blob: file, larghezza: imm.larghezza, altezza: imm.altezza })
        : ridisegna(imm, LATO_MASSIMO, QUALITA);
      return Promise.all([piena, ridisegna(imm, LATO_MINIATURA, QUALITA_MINIATURA)]).then(function (r) {
        imm.chiudi();
        var blob = intatta ? new Blob([file], { type: file.type }) : r[0].blob;
        return {
          blob: blob, miniatura: r[1].blob,
          nome: intatta ? (file.name || 'foto') : nomeJpeg(file.name),
          tipo: blob.type, larghezza: r[0].larghezza, altezza: r[0].altezza
        };
      }, function (e) { imm.chiudi(); throw e; });
    });
  }

  function creaMiniatura(blob) {
    return decodifica(blob).then(function (imm) {
      return ridisegna(imm, LATO_MINIATURA, QUALITA_MINIATURA).then(function (r) { imm.chiudi(); return r.blob; },
        function (e) { imm.chiudi(); throw e; });
    });
  }

  // ---------- spazio (la richiesta di archiviazione persistente sta in CasaNostra.db) ----------

  /**
   * Stima dello spazio: risolve con { scarso: bool, liberoByte } o null se non disponibile.
   * `byteInArrivo` = dimensione dei file che si stanno per aggiungere.
   */
  function stimaSpazio(byteInArrivo) {
    var s = navigator.storage;
    if (!s || typeof s.estimate !== 'function') return Promise.resolve(null);
    return s.estimate().then(function (st) {
      if (!st || !st.quota) return null;
      var libero = st.quota - (st.usage || 0);
      return { liberoByte: libero, scarso: libero < (byteInArrivo || 0) * 1.5 || (st.usage || 0) / st.quota > 0.9 };
    }).catch(function () { return null; });
  }

  // ---------- persistenza ----------

  function metadati(r) {
    if (!r) return r;
    var m = {};
    Object.keys(r).forEach(function (k) { if (k !== 'blob') m[k] = r[k]; });
    return m;
  }

  function perData(a, b) {
    if (a.aggiuntaIl !== b.aggiuntaIl) return a.aggiuntaIl < b.aggiuntaIl ? 1 : -1;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  }

  function elenco() {
    return raccolta().list().then(function (tutte) { return tutte.sort(perData).map(metadati); });
  }

  function leggi(id) { return raccolta().get(id); }

  function blobPieno(id) {
    return leggi(id).then(function (r) { return r ? r.blob : null; });
  }

  function conta() { return raccolta().list().then(function (t) { return t.length; }); }

  function elimina(id) { return raccolta().delete(id); }

  var ultimoIstante = '';
  /** ISO crescente anche per salvataggi nello stesso millisecondo, così l'ordine resta quello di aggiunta. */
  function istante() {
    var t = new Date();
    var s = t.toISOString();
    if (s <= ultimoIstante) s = new Date(Date.parse(ultimoIstante) + 1).toISOString();
    ultimoIstante = s;
    return s;
  }

  function salva(record) {
    return raccolta().put(record).then(metadati);
  }

  /**
   * Aggiunge i file uno alla volta. Un file non valido viene scartato e gli altri proseguono;
   * con lo spazio esaurito ci si ferma (nessuna foto resta a metà: blob e miniatura sono nello stesso record).
   */
  function aggiungiFile(files, opzioni) {
    var o = opzioni || {};
    var lista = Array.prototype.slice.call(files || []);
    var esito = { aggiunte: [], scartate: [], erroreQuota: null };
    return lista.reduce(function (catena, file) {
      return catena.then(function () {
        if (esito.erroreQuota) return;
        return elabora(file).then(function (el) {
          return salva({
            id: CasaNostra.nuovoId(), nome: el.nome, tipo: el.tipo, larghezza: el.larghezza, altezza: el.altezza,
            dimensione: el.blob.size, aggiuntaIl: istante(), blob: el.blob, miniatura: el.miniatura
          });
        }).then(function (m) {
          esito.aggiunte.push(m);
          if (o.dopoOgni) o.dopoOgni(m);
        }, function (err) {
          if (err && err.name === 'ErroreFoto') {
            esito.scartate.push({ nome: file.name || 'senza nome', motivo: err.message });
            return;
          }
          var tradotto = CasaNostra.db.traduciErrore(err);
          if (tradotto.tipo === 'quota') { esito.erroreQuota = tradotto; return; }
          throw tradotto;
        });
      });
    }, Promise.resolve()).then(function () { return esito; });
  }

  /** Salva una foto già elaborata (es. dall'Archivio foto) con l'id dato; calcola ciò che manca. */
  function aggiungiElaborata(dati) {
    if (!dati || !dati.id || !(dati.blob instanceof Blob)) {
      return Promise.reject(new Error('aggiungiElaborata: servono id e blob'));
    }
    var servonoMisure = !dati.larghezza || !dati.altezza;
    var misure = servonoMisure
      ? decodifica(dati.blob).then(function (imm) { imm.chiudi(); return { larghezza: imm.larghezza, altezza: imm.altezza }; })
      : Promise.resolve({ larghezza: dati.larghezza, altezza: dati.altezza });
    var miniatura = dati.miniatura instanceof Blob ? Promise.resolve(dati.miniatura) : creaMiniatura(dati.blob);
    return Promise.all([misure, miniatura]).then(function (r) {
      return salva({
        id: String(dati.id), nome: dati.nome || 'foto.jpg', tipo: dati.tipo || dati.blob.type || 'image/jpeg',
        larghezza: r[0].larghezza, altezza: r[0].altezza, dimensione: dati.blob.size,
        aggiuntaIl: dati.aggiuntaIl || istante(), blob: dati.blob, miniatura: r[1]
      });
    });
  }

  function rigeneraMiniatura(id) {
    return leggi(id).then(function (r) {
      if (!r) throw CasaNostra.errori.perUtente('La foto non esiste più.');
      return creaMiniatura(r.blob).then(function (m) {
        r.miniatura = m;
        return salva(r);
      });
    });
  }

  // ---------- URL temporanei ----------

  /** Un gruppo di URL blob: da revocare tutti insieme quando la vista che li usa sparisce. */
  function gruppoUrl() {
    var attivi = [];
    return {
      crea: function (blob) {
        var u = URL.createObjectURL(blob);
        attivi.push(u);
        return u;
      },
      revoca: function (u) {
        var i = attivi.indexOf(u);
        if (i === -1) return;
        attivi.splice(i, 1);
        URL.revokeObjectURL(u);
      },
      revocaTutti: function () {
        var l = attivi;
        attivi = [];
        l.forEach(function (u) { URL.revokeObjectURL(u); });
      },
      quanti: function () { return attivi.length; }
    };
  }

  /** Avvia il download di una foto con il suo nome. */
  function scarica(record) {
    CasaNostra.ui.scaricaBlob(record.blob, record.nome || 'foto.jpg');
  }

  CasaNostra.foto = {
    LATO_MASSIMO: LATO_MASSIMO,
    LATO_MINIATURA: LATO_MINIATURA,
    QUALITA: QUALITA,
    elenco: elenco,
    leggi: leggi,
    blobPieno: blobPieno,
    conta: conta,
    elimina: elimina,
    elabora: elabora,
    creaMiniatura: creaMiniatura,
    aggiungiFile: aggiungiFile,
    aggiungiElaborata: aggiungiElaborata,
    rigeneraMiniatura: rigeneraMiniatura,
    stimaSpazio: stimaSpazio,
    gruppoUrl: gruppoUrl,
    scarica: scarica
  };
})(window.CasaNostra);
