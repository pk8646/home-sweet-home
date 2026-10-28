/*
 * CasaNostra.sezioni.casa — pagina #/casa (promemoria casa) e scheda Casa della dashboard.
 * Le regole stanno in CasaNostra.dominio.casa; qui solo persistenza e interfaccia.
 */
(function (CasaNostra) {
  'use strict';

  var ui = CasaNostra.ui;
  var date = CasaNostra.date;
  var dominio = CasaNostra.dominio.casa;
  var MAX_SCHEDA = 5;
  var contatore = 0;

  function raccolta() { return CasaNostra.db.raccolta('promemoriaCasa'); }
  function adessoIso() { return new Date().toISOString(); }

  // ---------- operazioni ----------

  function salva(valori, base) {
    return raccolta().put(dominio.daValori(valori, base, CasaNostra.nuovoId(), adessoIso()));
  }

  function elimina(id) { return raccolta().delete(id); }

  function cambia(id, trasforma) {
    return raccolta().get(id).then(function (p) {
      if (p) return raccolta().put(trasforma(p));
    });
  }

  function completa(id) { return cambia(id, function (p) { return dominio.completa(p, date.oggi()); }); }
  function riapri(id) { return cambia(id, dominio.riapri); }

  // ---------- pezzi di interfaccia ----------

  function apriModulo(base) {
    var p = base || {};
    return CasaNostra.dialoghi.modulo({
      titolo: base ? 'Modifica promemoria' : 'Nuovo promemoria',
      testoConferma: 'Salva',
      campi: [
        { nome: 'titolo', etichetta: 'Titolo', tipo: 'text', valore: p.titolo || '', obbligatorio: true },
        { nome: 'categoria', etichetta: 'Categoria', tipo: 'select', obbligatorio: true,
          valore: p.categoria || 'manutenzione', opzioni: dominio.CATEGORIE },
        { nome: 'data', etichetta: 'Data', tipo: 'date', valore: p.data || '' },
        { nome: 'intervallo', etichetta: 'Ripeti ogni (giorni)', tipo: 'number', min: 1, step: 1,
          valore: p.intervallo || '', aiuto: 'Lascia vuoto se non si ripete.' },
        { nome: 'note', etichetta: 'Note', tipo: 'textarea', valore: p.note || '' }
      ],
      valida: dominio.validaValori
    });
  }

  function azioniVoce(p, aggiorna) {
    return ui.el('div', { class: 'promemoria-azioni' }, [
      p.completato
        ? ui.el('button', {
          type: 'button', class: 'pulsante pulsante-secondario', testo: 'Riapri', 'aria-label': 'Riapri ' + p.titolo,
          on: { click: CasaNostra.errori.protetta(function () { return riapri(p.id).then(aggiorna); }, 'riapertura del promemoria') }
        })
        : ui.el('button', {
          type: 'button', class: 'pulsante pulsante-primario', testo: 'Completa', 'aria-label': 'Completa ' + p.titolo,
          on: { click: CasaNostra.errori.protetta(function () { return completa(p.id).then(aggiorna); }, 'completamento del promemoria') }
        }),
      ui.el('button', {
        type: 'button', class: 'pulsante pulsante-secondario', testo: 'Modifica', 'aria-label': 'Modifica ' + p.titolo,
        on: { click: CasaNostra.errori.protetta(function () {
          return apriModulo(p).then(function (v) { if (v) return salva(v, p).then(aggiorna); });
        }, 'modifica del promemoria') }
      }),
      ui.el('button', {
        type: 'button', class: 'pulsante-icona pulsante-elimina', 'aria-label': 'Elimina ' + p.titolo,
        on: { click: CasaNostra.errori.protetta(function () {
          return CasaNostra.dialoghi.conferma({
            titolo: 'Eliminare il promemoria?',
            messaggio: '«' + p.titolo + '» verrà eliminato.',
            testoConferma: 'Elimina', pericolo: true
          }).then(function (ok) { if (ok) return elimina(p.id).then(aggiorna); });
        }, 'eliminazione del promemoria') }
      })
    ]);
  }

  /** Voce di un promemoria; nella scheda (compatta) solo titolo, data e stato, senza note né azioni. */
  function vocePromemoria(p, aggiorna, oggi, compatta) {
    var idTitolo = 'promemoria-' + p.id + '-' + (++contatore);
    var scaduto = dominio.scaduto(p, oggi);
    var dettagli = [ui.el('span', { class: 'promemoria-categoria', testo: dominio.nomeCategoria(p.categoria) })];
    if (scaduto) dettagli.push(ui.el('span', { class: 'promemoria-etichetta-scaduto', testo: 'Scaduto' }));
    if (p.data) dettagli.push(ui.el('span', { class: 'promemoria-data', testo: date.formattaBreve(p.data) }));
    if (p.intervallo) dettagli.push(ui.el('span', { class: 'promemoria-ricorrenza', testo: 'Ogni ' + p.intervallo + ' giorni' }));
    if (p.completato) {
      dettagli.push(ui.el('span', { class: 'promemoria-stato', testo: 'Completato' +
        (p.ultimoCompletamento ? ' ' + giornoRelativo(p.ultimoCompletamento, oggi) : '') }));
    } else if (p.ultimoCompletamento) {
      dettagli.push(ui.el('span', { class: 'promemoria-ultima', testo: 'Ultima volta: ' + giornoRelativo(p.ultimoCompletamento, oggi) }));
    }
    var figli = [
      ui.el('h4', { class: 'promemoria-titolo', id: idTitolo, testo: p.titolo }),
      ui.el('p', { class: 'promemoria-dettagli' }, dettagli)
    ];
    if (!compatta) {
      if (p.note) figli.push(ui.el('p', { class: 'promemoria-note', testo: p.note }));
      figli.push(azioniVoce(p, aggiorna));
    }
    var classe = 'voce-promemoria' + (scaduto ? ' promemoria-scaduto' : '') + (p.completato ? ' promemoria-completato' : '');
    return ui.el('li', { class: classe, 'aria-labelledby': idTitolo }, figli);
  }

  function giornoRelativo(iso, oggi) {
    var d = date.differenzaGiorni(iso, oggi);
    if (d === 0) return 'oggi';
    if (d === 1) return 'ieri';
    return date.formattaBreve(iso);
  }

  function elenco(titolo, promemoria, aggiorna, oggi, testoVuoto) {
    var idTitolo = 'casa-' + titolo.toLowerCase().replace(/\s+/g, '-') + '-' + (++contatore);
    var sezione = ui.el('section', { class: 'casa-elenco', 'aria-labelledby': idTitolo }, [
      ui.el('h3', { class: 'casa-elenco-titolo', id: idTitolo, testo: titolo + ' (' + promemoria.length + ')' })
    ]);
    if (promemoria.length) {
      sezione.appendChild(ui.el('ul', { class: 'lista-promemoria' }, promemoria.map(function (p) {
        return vocePromemoria(p, aggiorna, oggi);
      })));
    } else {
      sezione.appendChild(ui.el('p', { class: 'vuoto', testo: testoVuoto }));
    }
    return sezione;
  }

  // ---------- pagina ----------

  function disegnaPagina(contenitore) {
    var liste = ui.el('div', { class: 'casa-liste' });
    var idFiltro = 'casa-filtro-' + (++contatore);
    var filtro = ui.el('select', { id: idFiltro, class: 'campo' },
      [ui.el('option', { value: '', testo: 'Tutte' })].concat(dominio.CATEGORIE.map(function (c) {
        return ui.el('option', { value: c.valore, testo: c.testo });
      })));
    filtro.addEventListener('change', CasaNostra.errori.protetta(function () { return aggiorna(); }, 'filtro dei promemoria'));

    function aggiorna() {
      return raccolta().list().then(function (tutti) {
        var oggi = date.oggi();
        ui.svuota(liste);
        var s = dominio.separa(dominio.filtraCategoria(tutti, filtro.value));
        liste.appendChild(elenco('Da fare', s.daFare, aggiorna, oggi, 'Nessun promemoria da fare.'));
        liste.appendChild(elenco('Completati', s.completati, aggiorna, oggi, 'Nessun promemoria completato.'));
      });
    }

    contenitore.appendChild(ui.el('div', { class: 'casa-barra' }, [
      ui.el('button', {
        type: 'button', class: 'pulsante pulsante-primario', testo: 'Nuovo promemoria',
        on: { click: CasaNostra.errori.protetta(function () {
          return apriModulo(null).then(function (v) { if (v) return salva(v, null).then(aggiorna); });
        }, 'creazione del promemoria') }
      }),
      ui.el('div', { class: 'casa-filtro' }, [
        ui.el('label', { class: 'etichetta', for: idFiltro, testo: 'Filtra per categoria' }),
        filtro
      ])
    ]));
    contenitore.appendChild(liste);
    return aggiorna();
  }

  // ---------- scheda della dashboard ----------

  function disegnaScheda(corpo) {
    return raccolta().list().then(function (tutti) {
      var oggi = date.oggi();
      var daFare = dominio.separa(tutti).daFare;
      if (!daFare.length) {
        corpo.appendChild(ui.el('p', { class: 'vuoto', testo: 'Nessun promemoria da fare.' }));
      } else {
        corpo.appendChild(ui.el('ul', { class: 'lista-promemoria lista-promemoria-compatta' }, daFare.slice(0, MAX_SCHEDA).map(function (p) {
          return vocePromemoria(p, null, oggi, true);
        })));
      }
      corpo.appendChild(ui.linkVediTutti('casa', daFare.length));
    });
  }

  ui.registraSezione({ id: 'casa', titolo: 'Casa', icona: '🛠️', ordine: 50, disegna: disegnaPagina, dipendeDallaData: true });
  ui.registraScheda({ id: 'casa', titolo: 'Casa', icona: '🛠️', ordine: 60, dipendeDallaData: true, disegna: disegnaScheda });

  CasaNostra.sezioni.casa = { salva: salva, elimina: elimina, completa: completa, riapri: riapri };
})(window.CasaNostra);
