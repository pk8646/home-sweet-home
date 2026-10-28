/*
 * CasaNostra.dominio.agenda — regole pure (senza DOM, senza persistenza) per gli appuntamenti.
 * Un Appuntamento ({ id, titolo, data: 'AAAA-MM-GG', ora: 'HH:MM' | '', note, creatoIl }) si confronta
 * solo come stringhe locali: nessuna conversione in Date/UTC, così fuso e ora legale non lo spostano.
 */
(function (CasaNostra) {
  'use strict';

  /** Ordine cronologico; nello stesso giorno prima quelli senza ora, poi per ora, poi per inserimento. */
  function confronta(a, b) {
    if (a.data !== b.data) return a.data < b.data ? -1 : 1;
    var oa = a.ora || '', ob = b.ora || '';
    if (oa !== ob) return oa < ob ? -1 : 1;
    return String(a.creatoIl || '').localeCompare(String(b.creatoIl || ''));
  }

  function ordina(appuntamenti) {
    return appuntamenti.slice().sort(confronta);
  }

  /**
   * Divide gli appuntamenti rispetto a `oggi` ('AAAA-MM-GG'): quelli di oggi restano tra i prossimi fino a
   * mezzanotte anche dopo l'orario. Prossimi in ordine cronologico, passati dal più recente. Niente viene scartato.
   */
  function suddividi(appuntamenti, oggi) {
    var ordinati = ordina(appuntamenti);
    return {
      prossimi: ordinati.filter(function (a) { return a.data >= oggi; }),
      passati: ordinati.filter(function (a) { return a.data < oggi; }).reverse()
    };
  }

  /** 'oggi' | 'domani' se l'appuntamento è imminente, altrimenti null. */
  function imminente(a, oggi) {
    if (a.data === oggi) return 'oggi';
    if (a.data === CasaNostra.date.aggiungiGiorni(oggi, 1)) return 'domani';
    return null;
  }

  CasaNostra.dominio.agenda = {
    confronta: confronta,
    ordina: ordina,
    suddividi: suddividi,
    imminente: imminente
  };
})(window.CasaNostra);
