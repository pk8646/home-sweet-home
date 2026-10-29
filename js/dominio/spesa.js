/*
 * CasaNostra.dominio.spesa — regole pure della lista della spesa (senza DOM, senza persistenza).
 * Un Prodotto ({ id, nome, acquistato, creatoIl, acquistatoIl }) ha nome unico nella lista,
 * senza distinguere maiuscole e spazi.
 */
(function (CasaNostra) {
  'use strict';

  /** Nome come lo si mostra: spazi esterni tolti e spazi interni compressi. */
  function pulisciNome(nome) {
    return String(nome || '').replace(/\s+/g, ' ').trim();
  }

  /** Chiave di unicità: minuscolo, senza spazi esterni, spazi interni compressi. */
  function normalizzaNome(nome) {
    return pulisciNome(nome).toLowerCase();
  }

  function trova(prodotti, nome) {
    var chiave = normalizzaNome(nome);
    for (var i = 0; i < prodotti.length; i++) {
      if (normalizzaNome(prodotti[i].nome) === chiave) return prodotti[i];
    }
    return null;
  }

  /**
   * Decide cosa succede aggiungendo `nome` alla lista:
   *   { esito: 'vuoto' }                        nome vuoto, niente da fare
   *   { esito: 'giaDaComprare', prodotto }      già da comprare: avviso, nessun doppione
   *   { esito: 'riportato', prodotto }          era acquistato: torna da comprare (prodotto aggiornato)
   *   { esito: 'nuovo', prodotto }              prodotto nuovo da salvare
   */
  function valutaAggiunta(prodotti, nome, id, adessoIso) {
    var pulito = pulisciNome(nome);
    if (!pulito) return { esito: 'vuoto' };
    var esistente = trova(prodotti, pulito);
    if (esistente && !esistente.acquistato) return { esito: 'giaDaComprare', prodotto: esistente };
    if (esistente) {
      return { esito: 'riportato', prodotto: Object.assign({}, esistente, { acquistato: false, acquistatoIl: null }) };
    }
    return {
      esito: 'nuovo',
      prodotto: { id: id, nome: pulito, acquistato: false, creatoIl: adessoIso, acquistatoIl: null }
    };
  }

  /** Prodotto con lo stato acquistato invertito. */
  function alterna(prodotto, adessoIso) {
    var acquistato = !prodotto.acquistato;
    return Object.assign({}, prodotto, { acquistato: acquistato, acquistatoIl: acquistato ? adessoIso : null });
  }

  /** Da comprare in ordine di inserimento; acquistati dal più recente. */
  function separa(prodotti) {
    var daComprare = prodotti.filter(function (p) { return !p.acquistato; });
    var acquistati = prodotti.filter(function (p) { return p.acquistato; });
    daComprare.sort(function (a, b) { return String(a.creatoIl).localeCompare(String(b.creatoIl)); });
    acquistati.sort(function (a, b) { return String(b.acquistatoIl).localeCompare(String(a.acquistatoIl)); });
    return { daComprare: daComprare, acquistati: acquistati };
  }

  CasaNostra.dominio.spesa = {
    pulisciNome: pulisciNome,
    normalizzaNome: normalizzaNome,
    trova: trova,
    valutaAggiunta: valutaAggiunta,
    alterna: alterna,
    separa: separa
  };
})(window.CasaNostra);
