/*
 * CasaNostra.date — aritmetica delle date locali (pura, senza DOM).
 * Le date sono stringhe locali 'AAAA-MM-GG', le ore 'HH:MM'. Non si convertono mai in Date UTC per i
 * confronti: le stringhe si confrontano direttamente e "oggi" si calcola dai componenti locali.
 */
(function (CasaNostra) {
  'use strict';

  var GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  var MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio',
    'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

  function due(n) { return (n < 10 ? '0' : '') + n; }

  function parti(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) throw new Error('Data non valida: ' + iso);
    return { a: Number(m[1]), m: Number(m[2]), g: Number(m[3]) };
  }

  /** Giorni dall'epoca per una data di calendario (indipendente dal fuso). */
  function numeroGiorno(iso) {
    var p = parti(iso);
    return Math.round(Date.UTC(p.a, p.m - 1, p.g) / 86400000);
  }

  function daNumeroGiorno(n) {
    var d = new Date(n * 86400000);
    return d.getUTCFullYear() + '-' + due(d.getUTCMonth() + 1) + '-' + due(d.getUTCDate());
  }

  var date = {
    MESI: MESI,
    GIORNI: GIORNI,

    /** 'AAAA-MM-GG' dai componenti locali di `adesso` (default: ora). */
    oggi: function (adesso) {
      var d = adesso || new Date();
      return d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate());
    },

    /** 'HH:MM' dai componenti locali. */
    ora: function (adesso) {
      var d = adesso || new Date();
      return due(d.getHours()) + ':' + due(d.getMinutes());
    },

    /** true se `iso` è una data 'AAAA-MM-GG' esistente. */
    valida: function (iso) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return false;
      var p = parti(iso);
      return daNumeroGiorno(numeroGiorno(iso)) === iso && p.m >= 1 && p.m <= 12;
    },

    /** true se `hhmm` è un'ora 'HH:MM' valida. */
    oraValida: function (hhmm) {
      var m = /^(\d{2}):(\d{2})$/.exec(hhmm || '');
      return !!m && Number(m[1]) < 24 && Number(m[2]) < 60;
    },

    /** Somma `n` giorni (anche negativi) a una data 'AAAA-MM-GG'. */
    aggiungiGiorni: function (iso, n) {
      return daNumeroGiorno(numeroGiorno(iso) + n);
    },

    /** Giorni da `da` ad `a` (positivo se `a` è dopo `da`). */
    differenzaGiorni: function (da, a) {
      return numeroGiorno(a) - numeroGiorno(da);
    },

    /** 'mercoledì 28 ottobre 2026' */
    formattaLunga: function (iso) {
      var p = parti(iso);
      var gs = new Date(Date.UTC(p.a, p.m - 1, p.g)).getUTCDay();
      return GIORNI[gs] + ' ' + p.g + ' ' + MESI[p.m - 1] + ' ' + p.a;
    },

    /** '28/10/2026' */
    formattaBreve: function (iso) {
      var p = parti(iso);
      return due(p.g) + '/' + due(p.m) + '/' + p.a;
    },

    /** '28/10' */
    formattaGiornoMese: function (iso) {
      var p = parti(iso);
      return due(p.g) + '/' + due(p.m);
    }
  };

  CasaNostra.date = date;
})(window.CasaNostra);
