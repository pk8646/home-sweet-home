/*
 * CasaNostra.archivioFoto — Archivio foto (ticket #10): ZIP scritto a mano, separato dal backup dati.
 *
 * Formato: ZIP con metodo STORE (le foto sono già compresse), CRC32 calcolato qui, nomi UTF-8 (flag 0x0800).
 * Contiene le foto elaborate in `foto/` e l'indice `casa-nostra-foto.json`:
 *   { app: 'casa-nostra', schemaVersion: 1, esportatoIl: ISO,
 *     foto: [{ id, nome, aggiuntaIl, tipo, file }] }      (le miniature non ci sono: si rigenerano all'importazione)
 *
 * Interfaccia:
 *   creaArchivio()      -> Promise<{ blob, quante }>   (in memoria; errore 'memoria' se non basta)
 *   esporta()           -> Promise<{ quante, nome }>   (scarica casa-nostra-foto-AAAA-MM-GG.zip)
 *   importa(file)       -> Promise<{ importate, giaPresenti, nonLeggibili }>
 *                          rifiuta (perUtente) gli ZIP non STORE, i file non ZIP e gli archivi di altre app;
 *                          aggiunge solo gli id sconosciuti, non elimina mai foto esistenti.
 * Solo logica: il gruppo impostazioni "Archivio foto" (ordine 70) sta in js/sezioni/archivio-foto.js.
 */
(function (CasaNostra) {
  'use strict';

  var APP = 'casa-nostra';
  var SCHEMA = 1;
  var INDICE = 'casa-nostra-foto.json';
  var UTF8 = 0x0800;

  var MSG = {
    memoria: 'Memoria insufficiente per creare l\'archivio foto. In alternativa scarica le foto una per una ' +
      'dalla pagina Foto (apri una foto e tocca "Scarica"), oppure copiale dal PC.',
    nonArchivio: 'Il file scelto non è un archivio foto di Casa Nostra. Nessuna foto è stata modificata.',
    compresso: 'Questo ZIP è compresso o creato da un altro programma: si possono importare solo gli archivi ' +
      'esportati da Casa Nostra. Nessuna foto è stata modificata.',
    versione: 'Questo archivio foto viene da una versione più recente di Casa Nostra. Nessuna foto è stata modificata.'
  };

  function erroreUtente(chiave) {
    var e = CasaNostra.errori.perUtente(MSG[chiave]);
    e.motivo = chiave;
    return e;
  }

  // ---------- CRC32 ----------

  var TABELLA = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(byte) {
    var c = 0xffffffff;
    for (var i = 0; i < byte.length; i++) c = TABELLA[(c ^ byte[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  // ---------- scrittura ZIP (STORE) ----------

  function utf8(testo) { return new TextEncoder().encode(testo); }

  function dataDos(d) {
    return {
      ora: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
      data: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
    };
  }

  /** voci: [{ nome, byte: Uint8Array }] -> Blob application/zip. */
  function scriviZip(voci, quando) {
    if (voci.length > 0xffff) throw erroreUtente('memoria');
    var dos = dataDos(quando || new Date());
    var parti = [];
    var centrali = [];
    var offset = 0;
    voci.forEach(function (v) {
      var nome = utf8(v.nome);
      var crc = crc32(v.byte);
      var dim = v.byte.length;
      var l = new DataView(new ArrayBuffer(30));
      l.setUint32(0, 0x04034b50, true);
      l.setUint16(4, 20, true);
      l.setUint16(6, UTF8, true);
      l.setUint16(8, 0, true);
      l.setUint16(10, dos.ora, true);
      l.setUint16(12, dos.data, true);
      l.setUint32(14, crc, true);
      l.setUint32(18, dim, true);
      l.setUint32(22, dim, true);
      l.setUint16(26, nome.length, true);
      l.setUint16(28, 0, true);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true);
      c.setUint16(4, 20, true);
      c.setUint16(6, 20, true);
      c.setUint16(8, UTF8, true);
      c.setUint16(10, 0, true);
      c.setUint16(12, dos.ora, true);
      c.setUint16(14, dos.data, true);
      c.setUint32(16, crc, true);
      c.setUint32(20, dim, true);
      c.setUint32(24, dim, true);
      c.setUint16(28, nome.length, true);
      c.setUint32(42, offset, true);
      parti.push(l, nome, v.byte);
      centrali.push(c, nome);
      offset += 30 + nome.length + dim;
      if (offset > 0xffffffff) throw erroreUtente('memoria');
    });
    var dimDir = centrali.reduce(function (s, p) { return s + p.byteLength; }, 0);
    var e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true);
    e.setUint16(8, voci.length, true);
    e.setUint16(10, voci.length, true);
    e.setUint32(12, dimDir, true);
    e.setUint32(16, offset, true);
    return new Blob(parti.concat(centrali, [e]), { type: 'application/zip' });
  }

  // ---------- esportazione ----------

  function nomeSicuro(nome) {
    var s = String(nome || 'foto').replace(/[\/\\:*?"<>|\u0000-\u001f]+/g, '_').trim();
    return s || 'foto';
  }

  function pad(n) { return ('000' + n).slice(-4); }

  function eMemoria(err) {
    return !!err && (err.name === 'RangeError' || err.name === 'NotReadableError' || /memory|memoria/i.test(err.message || ''));
  }

  function creaArchivio() {
    return CasaNostra.foto.elenco().then(function (elenco) {
      var indice = { app: APP, schemaVersion: SCHEMA, esportatoIl: new Date().toISOString(), foto: [] };
      var voci = [];
      // Dalla più vecchia: l'archivio rispecchia l'ordine di aggiunta.
      return elenco.slice().reverse().reduce(function (catena, m, i) {
        return catena.then(function () {
          return CasaNostra.foto.blobPieno(m.id);
        }).then(function (blob) {
          if (!blob) return;
          return blob.arrayBuffer().then(function (buf) {
            var file = 'foto/' + pad(i + 1) + '-' + nomeSicuro(m.nome);
            voci.push({ nome: file, byte: new Uint8Array(buf) });
            indice.foto.push({ id: m.id, nome: m.nome, aggiuntaIl: m.aggiuntaIl, tipo: m.tipo || blob.type, file: file });
          });
        });
      }, Promise.resolve()).then(function () {
        voci.unshift({ nome: INDICE, byte: utf8(JSON.stringify(indice, null, 2)) });
        return { blob: scriviZip(voci), quante: indice.foto.length };
      });
    }).catch(function (err) {
      if (eMemoria(err)) {
        CasaNostra.errori.registra(err, 'creazione dell\'archivio foto');
        throw erroreUtente('memoria');
      }
      throw err;
    });
  }

  function esporta() {
    return creaArchivio().then(function (r) {
      var nome = 'casa-nostra-foto-' + CasaNostra.date.oggi() + '.zip';
      CasaNostra.ui.scaricaBlob(r.blob, nome);
      return { quante: r.quante, nome: nome };
    });
  }

  // ---------- lettura ZIP (solo STORE) ----------

  /**
   * Legge la directory centrale: Map nome -> { crc, dimensione, offsetLocale }.
   * Rifiuta i file non ZIP e gli ZIP con voci compresse o cifrate.
   */
  function leggiDirectory(byte) {
    var v = new DataView(byte.buffer, byte.byteOffset, byte.byteLength);
    var fine = -1;
    for (var i = byte.length - 22; i >= Math.max(0, byte.length - 65557); i--) {
      if (v.getUint32(i, true) === 0x06054b50) { fine = i; break; }
    }
    if (fine < 0) throw erroreUtente('nonArchivio');
    var quante = v.getUint16(fine + 10, true);
    var p = v.getUint32(fine + 16, true);
    var decodifica = new TextDecoder('utf-8');
    var voci = new Map();
    for (var n = 0; n < quante; n++) {
      if (p + 46 > byte.length || v.getUint32(p, true) !== 0x02014b50) throw erroreUtente('nonArchivio');
      var flag = v.getUint16(p + 8, true);
      var metodo = v.getUint16(p + 10, true);
      var lNome = v.getUint16(p + 28, true);
      var lExtra = v.getUint16(p + 30, true);
      var lCommento = v.getUint16(p + 32, true);
      if (metodo !== 0 || (flag & 1)) throw erroreUtente('compresso');
      var dimensione = v.getUint32(p + 20, true);
      if (v.getUint32(p + 24, true) !== dimensione) throw erroreUtente('compresso');
      voci.set(decodifica.decode(byte.subarray(p + 46, p + 46 + lNome)), {
        crc: v.getUint32(p + 16, true), dimensione: dimensione, offsetLocale: v.getUint32(p + 42, true)
      });
      p += 46 + lNome + lExtra + lCommento;
    }
    return voci;
  }

  /** Byte di una voce, o null se l'intestazione locale o il CRC32 non tornano (voce danneggiata). */
  function datiVoce(byte, voce) {
    var v = new DataView(byte.buffer, byte.byteOffset, byte.byteLength);
    var o = voce.offsetLocale;
    if (o + 30 > byte.length || v.getUint32(o, true) !== 0x04034b50 || v.getUint16(o + 8, true) !== 0) return null;
    var inizio = o + 30 + v.getUint16(o + 26, true) + v.getUint16(o + 28, true);
    if (inizio + voce.dimensione > byte.length) return null;
    var dati = byte.subarray(inizio, inizio + voce.dimensione);
    return crc32(dati) === voce.crc ? dati : null;
  }

  function leggiIndice(byte, voci) {
    var voce = voci.get(INDICE);
    var dati = voce && datiVoce(byte, voce);
    if (!dati) throw erroreUtente('nonArchivio');
    var indice;
    try { indice = JSON.parse(new TextDecoder('utf-8').decode(dati)); } catch (e) { throw erroreUtente('nonArchivio'); }
    if (!indice || indice.app !== APP || !Array.isArray(indice.foto) || typeof indice.schemaVersion !== 'number' ||
        Math.floor(indice.schemaVersion) !== indice.schemaVersion || indice.schemaVersion < 1) {
      throw erroreUtente('nonArchivio');
    }
    if (indice.schemaVersion > SCHEMA) throw erroreUtente('versione');
    // Punto previsto per le migrazioni delle versioni precedenti (oggi esiste solo la 1).
    return indice;
  }

  function leggiFile(file) {
    if (file && typeof file.arrayBuffer === 'function') return file.arrayBuffer();
    return new Promise(function (risolvi, rifiuta) {
      var r = new FileReader();
      r.onload = function () { risolvi(r.result); };
      r.onerror = function () { rifiuta(r.error); };
      r.readAsArrayBuffer(file);
    });
  }

  // ---------- importazione ----------

  function importa(file) {
    return leggiFile(file).then(function (buf) {
      var byte = new Uint8Array(buf);
      var voci = leggiDirectory(byte);
      var indice = leggiIndice(byte, voci);
      return CasaNostra.foto.elenco().then(function (esistenti) {
        var presenti = new Set(esistenti.map(function (f) { return f.id; }));
        var esito = { importate: 0, giaPresenti: 0, nonLeggibili: 0 };
        // Una foto alla volta: la memoria resta contenuta anche con archivi grandi.
        return indice.foto.reduce(function (catena, f) {
          return catena.then(function () {
            if (!f || typeof f.id !== 'string' || !f.id || typeof f.file !== 'string') { esito.nonLeggibili++; return; }
            if (presenti.has(f.id)) { esito.giaPresenti++; return; }
            var voce = voci.get(f.file);
            var dati = voce && datiVoce(byte, voce);
            if (!dati) { esito.nonLeggibili++; return; }
            var tipo = typeof f.tipo === 'string' && /^image\//.test(f.tipo) ? f.tipo : 'image/jpeg';
            var aggiuntaIl = typeof f.aggiuntaIl === 'string' && !isNaN(Date.parse(f.aggiuntaIl)) ? f.aggiuntaIl : undefined;
            return CasaNostra.foto.aggiungiElaborata({
              id: f.id, nome: typeof f.nome === 'string' && f.nome ? f.nome : f.file.replace(/^.*\//, ''),
              blob: new Blob([dati], { type: tipo }), tipo: tipo, aggiuntaIl: aggiuntaIl
            }).then(function () {
              presenti.add(f.id);
              esito.importate++;
            }, function (err) {
              if (err && err.name === 'ErroreFoto') { esito.nonLeggibili++; return; }
              var tradotto = CasaNostra.db.traduciErrore(err);
              if (tradotto.tipo === 'quota') tradotto.esitoParziale = esito;
              throw tradotto;
            });
          });
        }, Promise.resolve()).then(function () { return esito; });
      });
    });
  }

  CasaNostra.archivioFoto = {
    INDICE: INDICE,
    crc32: crc32,
    creaArchivio: creaArchivio,
    esporta: esporta,
    importa: importa
  };
})(window.CasaNostra);
