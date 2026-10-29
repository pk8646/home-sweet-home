/*
 * CasaNostra.dominio.casa — regole pure (senza DOM, senza persistenza) dei promemoria casa.
 * Un Promemoria casa è { id, titolo, categoria, data, note, intervalloGiorni, completato, ultimoCompletamento, creatoIl }:
 * data e ultimoCompletamento sono 'AAAA-MM-GG' o null, intervalloGiorni (intervallo di ricorrenza) è un intero positivo o null.
 */
(function (CasaNostra) {
  'use strict';

  var date = CasaNostra.date;

  var CATEGORIE = [
    { valore: 'manutenzione', testo: 'Manutenzione' },
    { valore: 'scadenza', testo: 'Scadenza' },
    { valore: 'controllo', testo: 'Controllo periodico' },
    { valore: 'altro', testo: 'Altro' }
  ];

  function categoriaValida(c) {
    return CATEGORIE.some(function (x) { return x.valore === c; });
  }

  function nomeCategoria(c) {
    for (var i = 0; i < CATEGORIE.length; i++) if (CATEGORIE[i].valore === c) return CATEGORIE[i].testo;
    return 'Altro';
  }

  /** Intervallo da testo: intero positivo, '' = nessuno, altrimenti NaN. */
  function leggiIntervallo(testo) {
    var t = String(testo == null ? '' : testo).trim();
    if (t === '') return null;
    return /^\d+$/.test(t) && Number(t) > 0 ? Number(t) : NaN;
  }

  /** Messaggio d'errore per i valori del modulo, o null se sono validi. */
  function validaValori(v) {
    if (!String(v.titolo || '').trim()) return 'Scrivi un titolo.';
    if (!categoriaValida(v.categoria)) return 'Scegli una categoria.';
    if (v.data && !date.valida(v.data)) return 'La data non è valida.';
    if (isNaN(leggiIntervallo(v.intervalloGiorni))) return 'L\'intervallo deve essere un numero intero di giorni maggiore di zero.';
    return null;
  }

  /** Promemoria (nuovo o aggiornato) dai valori del modulo. `base` è il promemoria che si modifica, se c'è. */
  function daValori(v, base, id, adessoIso) {
    var b = base || { id: id, completato: false, ultimoCompletamento: null, creatoIl: adessoIso };
    var intervallo = leggiIntervallo(v.intervalloGiorni);
    return Object.assign({}, b, {
      titolo: String(v.titolo).replace(/\s+/g, ' ').trim(),
      categoria: v.categoria,
      data: v.data || null,
      note: String(v.note || '').trim(),
      intervalloGiorni: intervallo,
      // Un promemoria diventato ricorrente non può restare "completato".
      completato: intervallo ? false : !!b.completato
    });
  }

  /**
   * Promemoria dopo il completamento di oggi. Se è ricorrente la data avanza dell'intervallo (dalla data prevista,
   * o da oggi se non c'è), si registra l'ultimo completamento e il promemoria resta aperto.
   */
  function completa(p, oggi) {
    if (p.intervalloGiorni) {
      return Object.assign({}, p, {
        data: date.aggiungiGiorni(p.data || oggi, p.intervalloGiorni),
        ultimoCompletamento: oggi,
        completato: false
      });
    }
    return Object.assign({}, p, { completato: true, ultimoCompletamento: oggi });
  }

  /** Promemoria completato riportato tra quelli da fare. */
  function riapri(p) {
    return Object.assign({}, p, { completato: false });
  }

  /** true se il promemoria è aperto e la sua data è prima di oggi. */
  function scaduto(p, oggi) {
    return !p.completato && !!p.data && p.data < oggi;
  }

  /** Confronto per data crescente; senza data in fondo; a parità, ordine di creazione. */
  function confronta(a, b) {
    if (a.data !== b.data) {
      if (!a.data) return 1;
      if (!b.data) return -1;
      return a.data < b.data ? -1 : 1;
    }
    return String(a.creatoIl).localeCompare(String(b.creatoIl));
  }

  /** Copia ordinata per data (senza data in fondo). */
  function ordina(promemoria) {
    return promemoria.slice().sort(confronta);
  }

  /** Solo i promemoria della categoria indicata ('' o null = tutte). */
  function filtraCategoria(promemoria, categoria) {
    if (!categoria) return promemoria.slice();
    return promemoria.filter(function (p) { return p.categoria === categoria; });
  }

  /** Separa i promemoria aperti da quelli completati, entrambi ordinati per data. */
  function separa(promemoria) {
    var ordinati = ordina(promemoria);
    return {
      daFare: ordinati.filter(function (p) { return !p.completato; }),
      completati: ordinati.filter(function (p) { return p.completato; })
    };
  }

  CasaNostra.dominio.casa = {
    completa: completa,
    riapri: riapri,
    separa: separa,
    ordina: ordina,
    filtraCategoria: filtraCategoria,
    scaduto: scaduto,
    CATEGORIE: CATEGORIE,
    nomeCategoria: nomeCategoria,
    leggiIntervallo: leggiIntervallo,
    validaValori: validaValori,
    daValori: daValori
  };
})(window.CasaNostra);
