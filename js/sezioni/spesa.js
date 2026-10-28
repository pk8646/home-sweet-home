/*
 * CasaNostra.sezioni.spesa — pagina #/spesa e scheda Spesa della dashboard (con aggiunta rapida).
 * Le regole stanno in CasaNostra.dominio.spesa; qui solo persistenza e interfaccia.
 */
(function (CasaNostra) {
  'use strict';

  var ui = CasaNostra.ui;
  var dominio = CasaNostra.dominio.spesa;
  var MAX_SCHEDA = 5;
  var contatore = 0;

  function raccolta() { return CasaNostra.db.raccolta('prodotti'); }
  function adessoIso() { return new Date().toISOString(); }

  // ---------- operazioni ----------

  var coda = Promise.resolve();

  /**
   * Aggiunge un prodotto rispettando l'unicità del nome. Risolve con l'esito di dominio.valutaAggiunta.
   * Le aggiunte sono messe in fila, così due inserimenti rapidi dello stesso nome non creano doppioni.
   */
  function aggiungi(nome) {
    var risultato = coda.then(function () { return aggiungiSubito(nome); });
    coda = risultato.catch(function () {});
    return risultato;
  }

  function aggiungiSubito(nome) {
    return raccolta().list().then(function (prodotti) {
      var r = dominio.valutaAggiunta(prodotti, nome, CasaNostra.nuovoId(), adessoIso());
      if (r.esito === 'giaDaComprare') {
        ui.toast('«' + r.prodotto.nome + '» è già nella lista da comprare.', { tipo: 'info' });
        return r;
      }
      if (r.esito === 'vuoto') return r;
      return raccolta().put(r.prodotto).then(function () {
        if (r.esito === 'riportato') ui.toast('«' + r.prodotto.nome + '» è di nuovo da comprare.', { tipo: 'successo' });
        return r;
      });
    });
  }

  function alterna(id) {
    return raccolta().get(id).then(function (p) {
      if (p) return raccolta().put(dominio.alterna(p, adessoIso()));
    });
  }

  function elimina(id) { return raccolta().delete(id); }

  function rimuoviAcquistati() {
    return raccolta().list().then(function (prodotti) {
      return Promise.all(prodotti.filter(function (p) { return p.acquistato; }).map(function (p) {
        return raccolta().delete(p.id);
      }));
    });
  }

  function svuotaTutto() { return raccolta().clear(); }

  // ---------- pezzi di interfaccia ----------

  /** Modulo di aggiunta; dopoAggiunta() viene chiamata dopo ogni tentativo riuscito. */
  function moduloAggiunta(dopoAggiunta) {
    var id = 'spesa-nuovo-' + (++contatore);
    var campo = ui.el('input', {
      id: id, class: 'campo', type: 'text', autocomplete: 'off', enterkeyhint: 'done', maxlength: '120',
      placeholder: 'Es. Latte x2'
    });
    var modulo = ui.el('form', { class: 'spesa-aggiunta', novalidate: true }, [
      ui.el('label', { class: 'etichetta', for: id, testo: 'Prodotto da aggiungere' }),
      ui.el('div', { class: 'riga-aggiunta' }, [
        campo,
        ui.el('button', { type: 'submit', class: 'pulsante pulsante-primario', testo: 'Aggiungi' })
      ])
    ]);
    modulo.addEventListener('submit', CasaNostra.errori.protetta(function (ev) {
      ev.preventDefault();
      var inviato = campo.value;
      if (!dominio.pulisciNome(inviato)) { campo.focus(); return; }
      return aggiungi(inviato).then(function (r) {
        // Se nel frattempo l'utente ha già scritto altro, non lo cancelliamo.
        if (r.esito !== 'giaDaComprare' && campo.value === inviato) campo.value = '';
        campo.focus();
        return dopoAggiunta();
      });
    }, 'aggiunta alla spesa'));
    return modulo;
  }

  function voceProdotto(p, aggiorna, conElimina) {
    var idCasella = 'prodotto-' + p.id + '-' + (++contatore);
    var casella = ui.el('input', { id: idCasella, type: 'checkbox', class: 'casella', checked: !!p.acquistato });
    casella.addEventListener('change', CasaNostra.errori.protetta(function () {
      return alterna(p.id).then(aggiorna);
    }, 'aggiornamento della spesa'));
    var figli = [
      ui.el('label', { class: 'prodotto', for: idCasella }, [casella, ui.el('span', { class: 'prodotto-nome', testo: p.nome })])
    ];
    if (conElimina) {
      figli.push(ui.el('button', {
        type: 'button', class: 'pulsante-icona pulsante-elimina', 'aria-label': 'Elimina ' + p.nome,
        on: { click: CasaNostra.errori.protetta(function () { return elimina(p.id).then(aggiorna); }, 'eliminazione dalla spesa') }
      }));
    }
    return ui.el('li', { class: 'voce-prodotto' + (p.acquistato ? ' voce-acquistata' : '') }, figli);
  }

  function elenco(titolo, prodotti, aggiorna, testoVuoto) {
    var idTitolo = 'spesa-' + titolo.toLowerCase().replace(/\s+/g, '-') + '-' + (++contatore);
    var sezione = ui.el('section', { class: 'spesa-elenco', 'aria-labelledby': idTitolo }, [
      ui.el('h3', { class: 'spesa-elenco-titolo', id: idTitolo, testo: titolo + ' (' + prodotti.length + ')' })
    ]);
    if (prodotti.length) {
      sezione.appendChild(ui.el('ul', { class: 'lista-prodotti' }, prodotti.map(function (p) {
        return voceProdotto(p, aggiorna, true);
      })));
    } else {
      sezione.appendChild(ui.el('p', { class: 'vuoto', testo: testoVuoto }));
    }
    return sezione;
  }

  // ---------- pagina ----------

  function disegnaPagina(contenitore) {
    var liste = ui.el('div', { class: 'spesa-liste' });

    function aggiorna() {
      return raccolta().list().then(function (prodotti) {
        var s = dominio.separa(prodotti);
        ui.svuota(liste);
        liste.appendChild(elenco('Da comprare', s.daComprare, aggiorna, 'Niente da comprare. Scrivi un prodotto qui sopra.'));
        liste.appendChild(elenco('Acquistati', s.acquistati, aggiorna, 'Nessun prodotto acquistato.'));
        liste.appendChild(ui.el('div', { class: 'spesa-azioni' }, [
          ui.el('button', {
            type: 'button', class: 'pulsante pulsante-secondario', testo: 'Rimuovi acquistati', disabled: !s.acquistati.length,
            on: { click: CasaNostra.errori.protetta(function () {
              return CasaNostra.dialoghi.conferma({
                titolo: 'Rimuovere gli acquistati?',
                messaggio: 'I ' + s.acquistati.length + ' prodotti acquistati verranno tolti dalla lista.',
                testoConferma: 'Rimuovi', pericolo: true
              }).then(function (ok) { if (ok) return rimuoviAcquistati().then(aggiorna); });
            }, 'rimozione degli acquistati') }
          }),
          ui.el('button', {
            type: 'button', class: 'pulsante pulsante-pericolo', testo: 'Svuota tutto', disabled: !prodotti.length,
            on: { click: CasaNostra.errori.protetta(function () {
              return CasaNostra.dialoghi.conferma({
                titolo: 'Svuotare la lista?',
                messaggio: 'Tutti i ' + prodotti.length + ' prodotti verranno eliminati, sia da comprare sia acquistati.',
                testoConferma: 'Svuota', pericolo: true
              }).then(function (ok) { if (ok) return svuotaTutto().then(aggiorna); });
            }, 'svuotamento della spesa') }
          })
        ]));
      });
    }

    contenitore.appendChild(moduloAggiunta(aggiorna));
    contenitore.appendChild(liste);
    return aggiorna();
  }

  // ---------- scheda della dashboard ----------

  function disegnaScheda(corpo) {
    var elencoScheda = ui.el('div', { class: 'spesa-scheda-elenco' });

    function aggiorna() {
      return raccolta().list().then(function (prodotti) {
        var daComprare = dominio.separa(prodotti).daComprare;
        ui.svuota(elencoScheda);
        if (!daComprare.length) {
          elencoScheda.appendChild(ui.el('p', { class: 'vuoto', testo: 'Niente da comprare.' }));
        } else {
          elencoScheda.appendChild(ui.el('ul', { class: 'lista-prodotti' }, daComprare.slice(0, MAX_SCHEDA).map(function (p) {
            return voceProdotto(p, aggiorna, false);
          })));
        }
        elencoScheda.appendChild(ui.linkVediTutti('spesa', daComprare.length));
      });
    }

    corpo.appendChild(moduloAggiunta(aggiorna));
    corpo.appendChild(elencoScheda);
    return aggiorna();
  }

  ui.registraSezione({ id: 'spesa', titolo: 'Spesa', icona: '🛒', ordine: 20, disegna: disegnaPagina });
  ui.registraScheda({ id: 'spesa', titolo: 'Spesa', icona: '🛒', ordine: 50, disegna: disegnaScheda });

  CasaNostra.sezioni.spesa = {
    aggiungi: aggiungi,
    alterna: alterna,
    elimina: elimina,
    rimuoviAcquistati: rimuoviAcquistati,
    svuotaTutto: svuotaTutto
  };
})(window.CasaNostra);
