/*
 * CasaNostra.sezioni.agenda — pagina #/agenda e scheda Agenda della dashboard.
 * Le regole stanno in CasaNostra.dominio.agenda; qui solo persistenza e interfaccia.
 */
(function (CasaNostra) {
  'use strict';

  var ui = CasaNostra.ui;
  var date = CasaNostra.date;
  var dominio = CasaNostra.dominio.agenda;
  var contatore = 0;
  var MAX_SCHEDA = 5;

  function raccolta() { return CasaNostra.db.raccolta('appuntamenti'); }

  function aggiungi(valori) {
    var a = {
      id: CasaNostra.nuovoId(), titolo: valori.titolo, data: valori.data, ora: valori.ora || '',
      note: valori.note || '', creatoIl: new Date().toISOString()
    };
    return raccolta().put(a).then(function () { return a; });
  }

  function modifica(id, valori) {
    return raccolta().get(id).then(function (a) {
      if (!a) return null;
      var nuovo = Object.assign({}, a, { titolo: valori.titolo, data: valori.data, ora: valori.ora || '', note: valori.note || '' });
      return raccolta().put(nuovo).then(function () { return nuovo; });
    });
  }

  function elimina(id) { return raccolta().delete(id); }

  function campiModulo(a) {
    return [
      { nome: 'titolo', etichetta: 'Titolo', obbligatorio: true, valore: a.titolo || '' },
      { nome: 'data', etichetta: 'Data', tipo: 'date', obbligatorio: true, valore: a.data || '' },
      { nome: 'ora', etichetta: 'Ora', tipo: 'time', valore: a.ora || '' },
      { nome: 'note', etichetta: 'Note', tipo: 'textarea', valore: a.note || '' }
    ];
  }

  function chiediDati(titolo, a) {
    return CasaNostra.dialoghi.modulo({ titolo: titolo, campi: campiModulo(a) });
  }

  var ETICHETTE_IMMINENTE = { oggi: 'Oggi', domani: 'Domani' };

  /** Voce di elenco; con ggiorna mostra anche i pulsanti Modifica/Elimina. */
  function voceAppuntamento(a, oggi, aggiorna) {
    var quando = dominio.imminente(a, oggi);
    var figli = [
      ui.el('span', { class: 'appuntamento-quando', testo: date.formattaLunga(a.data) + (a.ora ? ', ' + a.ora : '') }),
      ui.el('span', { class: 'appuntamento-titolo', testo: a.titolo })
    ];
    if (quando) figli.unshift(ui.el('span', { class: 'appuntamento-imminente', testo: ETICHETTE_IMMINENTE[quando] }));
    if (a.note) figli.push(ui.el('span', { class: 'appuntamento-note', testo: a.note }));
    var classe = 'voce-appuntamento' + (quando ? ' voce-imminente' : '');
    var testo = ui.el('div', { class: 'appuntamento-testo' }, figli);
    if (!aggiorna) return ui.el('li', { class: classe }, [testo]);
    var azioni = ui.el('div', { class: 'appuntamento-azioni' }, [
      ui.el('button', {
        type: 'button', class: 'pulsante pulsante-secondario', testo: 'Modifica', 'aria-label': 'Modifica ' + a.titolo,
        on: { click: CasaNostra.errori.protetta(function () {
          return chiediDati('Modifica appuntamento', a).then(function (v) { if (v) return modifica(a.id, v).then(aggiorna); });
        }, 'modifica di un appuntamento') }
      }),
      ui.el('button', {
        type: 'button', class: 'pulsante-icona pulsante-elimina', 'aria-label': 'Elimina ' + a.titolo,
        on: { click: CasaNostra.errori.protetta(function () {
          return CasaNostra.dialoghi.confermaElimina({
            titolo: 'Eliminare l\'appuntamento?',
            messaggio: '«' + a.titolo + '» del ' + date.formattaLunga(a.data) + ' verrà eliminato.'
          }, function () { return elimina(a.id).then(aggiorna); });
        }, 'eliminazione di un appuntamento') }
      })
    ]);
    return ui.el('li', { class: classe }, [testo, azioni]);
  }

  function disegnaPagina(contenitore, contesto) {
    var liste = ui.el('div', { class: 'agenda-liste' });

    function aggiorna() {
      return raccolta().list().then(function (tutti) {
        var s = dominio.suddividi(tutti, contesto.oggi);
        function voci(elenco) {
          return ui.el('ul', { class: 'lista-appuntamenti' }, elenco.map(function (a) { return voceAppuntamento(a, contesto.oggi, aggiorna); }));
        }
        var idTitolo = 'agenda-in-programma-' + (++contatore);
        ui.svuota(liste);
        liste.appendChild(ui.el('section', { class: 'agenda-elenco', 'aria-labelledby': idTitolo }, [
          ui.el('h3', { class: 'agenda-elenco-titolo', id: idTitolo, testo: 'In programma (' + s.inProgramma.length + ')' }),
          s.inProgramma.length ? voci(s.inProgramma) : ui.el('p', { class: 'vuoto', testo: 'Nessun appuntamento in programma.' })
        ]));
        // I passati non si cancellano mai da soli: restano qui, chiusi per default.
        liste.appendChild(ui.el('details', { class: 'agenda-elenco agenda-passati' }, [
          ui.el('summary', { class: 'agenda-elenco-titolo', testo: 'Passati (' + s.passati.length + ')' }),
          s.passati.length ? voci(s.passati) : ui.el('p', { class: 'vuoto', testo: 'Nessun appuntamento passato.' })
        ]));
      });
    }

    contenitore.appendChild(ui.el('button', {
      type: 'button', class: 'pulsante pulsante-primario', testo: 'Nuovo appuntamento',
      on: { click: CasaNostra.errori.protetta(function () {
        return chiediDati('Nuovo appuntamento', { data: contesto.oggi }).then(function (v) { if (v) return aggiungi(v).then(aggiorna); });
      }, 'aggiunta di un appuntamento') }
    }));
    contenitore.appendChild(liste);
    return aggiorna();
  }

  // ---------- scheda della dashboard ----------

  function disegnaScheda(corpo, contesto) {
    return raccolta().list().then(function (tutti) {
      var inProgramma = dominio.suddividi(tutti, contesto.oggi).inProgramma;
      if (!inProgramma.length) {
        corpo.appendChild(ui.el('p', { class: 'vuoto', testo: 'Nessun appuntamento in programma.' }));
      } else {
        corpo.appendChild(ui.el('ul', { class: 'lista-appuntamenti' }, inProgramma.slice(0, MAX_SCHEDA).map(function (a) {
          return voceAppuntamento(a, contesto.oggi);
        })));
      }
      corpo.appendChild(ui.linkVediTutti('agenda', inProgramma.length));
    });
  }

  ui.registraSezione({ id: 'agenda', titolo: 'Agenda', icona: '📅', ordine: 30, disegna: disegnaPagina, dipendeDallaData: true });
  ui.registraScheda({ id: 'agenda', titolo: 'Agenda', icona: '📅', ordine: 30, dipendeDallaData: true, disegna: disegnaScheda });

  CasaNostra.sezioni.agenda = { aggiungi: aggiungi, modifica: modifica, elimina: elimina };
})(window.CasaNostra);
