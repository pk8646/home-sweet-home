/*
 * CasaNostra.dominio.attivita — regole pure (senza DOM, senza persistenza) delle attività.
 * Un'Attività ({ id, titolo, nota, completata, creataIl, completataIl }) è una cosa da fare senza data,
 * che a un certo punto diventa completata.
 */
(function (CasaNostra) {
  'use strict';

  /** Titolo come lo si mostra: spazi esterni tolti e spazi interni compressi. */
  function pulisciTitolo(titolo) {
    return String(titolo || '').replace(/\s+/g, ' ').trim();
  }

  function pulisciNota(nota) {
    return String(nota || '').trim();
  }

  /** Nuova attività da fare, oppure null se il titolo è vuoto. */
  function crea(titolo, nota, id, adessoIso) {
    var t = pulisciTitolo(titolo);
    if (!t) return null;
    return { id: id, titolo: t, nota: pulisciNota(nota), completata: false, creataIl: adessoIso, completataIl: null };
  }

  /** Da fare in ordine di inserimento, poi le completate dalla più recente. */
  function ordina(attivita) {
    var daFare = attivita.filter(function (a) { return !a.completata; });
    var completate = attivita.filter(function (a) { return a.completata; });
    daFare.sort(function (a, b) { return String(a.creataIl).localeCompare(String(b.creataIl)); });
    completate.sort(function (a, b) { return String(b.completataIl).localeCompare(String(a.completataIl)); });
    return daFare.concat(completate);
  }

  /** Attività con titolo e nota nuovi, oppure null se il titolo è vuoto. */
  function modifica(attivita, titolo, nota) {
    var t = pulisciTitolo(titolo);
    if (!t) return null;
    return Object.assign({}, attivita, { titolo: t, nota: pulisciNota(nota) });
  }

  /** Attività con lo stato completata invertito. */
  function alterna(attivita, adessoIso) {
    var completata = !attivita.completata;
    return Object.assign({}, attivita, { completata: completata, completataIl: completata ? adessoIso : null });
  }

  /** Filtri della pagina, nell'ordine in cui si mostrano. */
  var FILTRI = [
    { id: 'daFare', testo: 'Da fare' },
    { id: 'completate', testo: 'Completate' },
    { id: 'tutte', testo: 'Tutte' }
  ];

  /** Attività che rientrano nel filtro ('daFare' | 'completate' | 'tutte'), già ordinate. */
  function filtra(attivita, filtro) {
    return ordina(attivita).filter(function (a) {
      if (filtro === 'daFare') return !a.completata;
      if (filtro === 'completate') return a.completata;
      return true;
    });
  }

  CasaNostra.dominio.attivita = {
    FILTRI: FILTRI,
    pulisciTitolo: pulisciTitolo,
    pulisciNota: pulisciNota,
    crea: crea,
    modifica: modifica,
    alterna: alterna,
    ordina: ordina,
    filtra: filtra
  };
})(window.CasaNostra);
