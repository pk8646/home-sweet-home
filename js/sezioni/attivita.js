/*
 * CasaNostra.sezioni.attivita — pagina #/attivita e scheda Attività della dashboard.
 * Le regole stanno in CasaNostra.dominio.attivita; qui solo persistenza e interfaccia.
 */
(function (CasaNostra) {
  'use strict';

  var ui = CasaNostra.ui;
  var dominio = CasaNostra.dominio.attivita;
  var contatore = 0;
  var MAX_SCHEDA = 5;
  var TESTI_VUOTO = {
    daFare: 'Nessuna attività da fare. Scrivine una qui sopra.',
    completate: 'Nessuna attività completata.',
    tutte: 'Nessuna attività. Scrivine una qui sopra.'
  };

  function raccolta() { return CasaNostra.db.raccolta('attivita'); }
  function adessoIso() { return new Date().toISOString(); }

  // ---------- operazioni ----------

  /** Salva una nuova attività; risolve con l'attività o null se il titolo è vuoto. */
  function aggiungi(titolo, nota) {
    var a = dominio.crea(titolo, nota, CasaNostra.nuovoId(), adessoIso());
    if (!a) return Promise.resolve(null);
    return raccolta().put(a).then(function () { return a; });
  }

  /** Cambia titolo e nota; risolve con l'attività aggiornata o null (titolo vuoto o attività sparita). */
  function modifica(id, titolo, nota) {
    return raccolta().get(id).then(function (a) {
      var nuova = a && dominio.modifica(a, titolo, nota);
      if (!nuova) return null;
      return raccolta().put(nuova).then(function () { return nuova; });
    });
  }

  function apriModifica(a, aggiorna) {
    return CasaNostra.dialoghi.modulo({
      titolo: 'Modifica attività',
      testoConferma: 'Salva',
      campi: [
        { nome: 'titolo', etichetta: 'Titolo', tipo: 'text', valore: a.titolo, obbligatorio: true },
        { nome: 'nota', etichetta: 'Nota', tipo: 'textarea', valore: a.nota || '' }
      ]
    }).then(function (valori) {
      if (valori) return modifica(a.id, valori.titolo, valori.nota).then(aggiorna);
    });
  }

  function elimina(id) { return raccolta().delete(id); }

  function chiediElimina(a, aggiorna) {
    return CasaNostra.dialoghi.conferma({
      titolo: 'Eliminare l\'attività?',
      messaggio: '«' + a.titolo + '» verrà eliminata.',
      testoConferma: 'Elimina', pericolo: true
    }).then(function (ok) { if (ok) return elimina(a.id).then(aggiorna); });
  }

  function alterna(id) {
    return raccolta().get(id).then(function (a) {
      if (a) return raccolta().put(dominio.alterna(a, adessoIso()));
    });
  }

  // ---------- pezzi di interfaccia ----------

  function moduloAggiunta(dopoAggiunta) {
    var n = ++contatore;
    var campoTitolo = ui.el('input', {
      id: 'attivita-titolo-' + n, class: 'campo', type: 'text', autocomplete: 'off', maxlength: '200',
      placeholder: 'Es. Chiamare l\'idraulico'
    });
    var campoNota = ui.el('input', {
      id: 'attivita-nota-' + n, class: 'campo', type: 'text', autocomplete: 'off', maxlength: '500'
    });
    var errore = ui.el('p', { class: 'attivita-errore', role: 'alert', hidden: true });
    var modulo = ui.el('form', { class: 'attivita-aggiunta', novalidate: true }, [
      ui.el('label', { class: 'etichetta', for: campoTitolo.id, testo: 'Nuova attività' }),
      campoTitolo,
      ui.el('label', { class: 'etichetta', for: campoNota.id, testo: 'Nota (facoltativo)' }),
      campoNota,
      errore,
      ui.el('button', { type: 'submit', class: 'pulsante pulsante-primario', testo: 'Aggiungi' })
    ]);
    modulo.addEventListener('submit', CasaNostra.errori.protetta(function (ev) {
      ev.preventDefault();
      if (!dominio.pulisciTitolo(campoTitolo.value)) {
        errore.textContent = 'Scrivi un titolo per l\'attività.';
        errore.hidden = false;
        campoTitolo.focus();
        return;
      }
      errore.hidden = true;
      var titolo = campoTitolo.value;
      var nota = campoNota.value;
      return aggiungi(titolo, nota).then(function () {
        // Se nel frattempo l'utente ha già scritto altro, non lo cancelliamo.
        if (campoTitolo.value === titolo) campoTitolo.value = '';
        if (campoNota.value === nota) campoNota.value = '';
        campoTitolo.focus();
        return dopoAggiunta();
      });
    }, 'aggiunta di un\'attività'));
    return modulo;
  }

  function voceAttivita(a, aggiorna, conAzioni) {
    var idCasella = 'attivita-' + a.id + '-' + (++contatore);
    var idTitolo = idCasella + '-titolo';
    var casella = ui.el('input', {
      id: idCasella, type: 'checkbox', class: 'casella', checked: !!a.completata, 'aria-labelledby': idTitolo
    });
    casella.addEventListener('change', CasaNostra.errori.protetta(function () {
      return alterna(a.id).then(aggiorna);
    }, 'aggiornamento di un\'attività'));
    var testi = [ui.el('span', { class: 'attivita-titolo', id: idTitolo, testo: a.titolo })];
    if (a.nota) testi.push(ui.el('span', { class: 'attivita-nota', testo: a.nota }));
    var figli = [
      ui.el('label', { class: 'attivita', for: idCasella }, [casella, ui.el('span', { class: 'attivita-testi' }, testi)])
    ];
    if (conAzioni) {
      figli.push(ui.el('button', {
        type: 'button', class: 'pulsante-icona pulsante-modifica', 'aria-label': 'Modifica ' + a.titolo,
        on: { click: CasaNostra.errori.protetta(function () { return apriModifica(a, aggiorna); }, 'modifica di un\'attività') }
      }));
      figli.push(ui.el('button', {
        type: 'button', class: 'pulsante-icona pulsante-elimina', 'aria-label': 'Elimina ' + a.titolo,
        on: { click: CasaNostra.errori.protetta(function () { return chiediElimina(a, aggiorna); }, 'eliminazione di un\'attività') }
      }));
    }
    return ui.el('li', { class: 'voce-attivita' + (a.completata ? ' voce-completata' : '') }, figli);
  }

  // ---------- pagina ----------

  function disegnaPagina(contenitore) {
    var filtroAttivo = 'daFare';
    var elenco = ui.el('div', { class: 'attivita-elenco' });
    var pulsantiFiltro = dominio.FILTRI.map(function (f) {
      return ui.el('button', {
        type: 'button', class: 'pulsante pulsante-secondario attivita-filtro', 'data-filtro': f.id, testo: f.testo,
        on: { click: CasaNostra.errori.protetta(function () { filtroAttivo = f.id; return aggiorna(); }, 'filtro delle attività') }
      });
    });
    var barraFiltri = ui.el('div', { class: 'attivita-filtri', role: 'group', 'aria-label': 'Filtro attività' }, pulsantiFiltro);

    function aggiorna() {
      pulsantiFiltro.forEach(function (p) {
        p.setAttribute('aria-pressed', String(p.getAttribute('data-filtro') === filtroAttivo));
      });
      return raccolta().list().then(function (tutte) {
        var visibili = dominio.filtra(tutte, filtroAttivo);
        ui.svuota(elenco);
        if (!visibili.length) {
          elenco.appendChild(ui.el('p', { class: 'vuoto', testo: TESTI_VUOTO[filtroAttivo] }));
          return;
        }
        elenco.appendChild(ui.el('ul', { class: 'lista-attivita', 'aria-label': 'Elenco attività' },
          visibili.map(function (a) { return voceAttivita(a, aggiorna, true); })));
      });
    }

    contenitore.appendChild(moduloAggiunta(aggiorna));
    contenitore.appendChild(barraFiltri);
    contenitore.appendChild(elenco);
    return aggiorna();
  }

  // ---------- scheda della dashboard ----------

  function disegnaScheda(corpo) {
    function aggiorna() {
      return raccolta().list().then(function (tutte) {
        var daFare = dominio.filtra(tutte, 'daFare');
        ui.svuota(corpo);
        if (!daFare.length) {
          corpo.appendChild(ui.el('p', { class: 'vuoto', testo: 'Nessuna attività da fare.' }));
        } else {
          corpo.appendChild(ui.el('ul', { class: 'lista-attivita', 'aria-label': 'Attività da fare' },
            daFare.slice(0, MAX_SCHEDA).map(function (a) { return voceAttivita(a, aggiorna, false); })));
        }
        corpo.appendChild(ui.linkVediTutti('attivita', daFare.length, 'Vedi tutte'));
      });
    }
    return aggiorna();
  }

  ui.registraSezione({ id: 'attivita', titolo: 'Attività', icona: '✅', ordine: 40, disegna: disegnaPagina });
  ui.registraScheda({ id: 'attivita', titolo: 'Attività', icona: '✅', ordine: 40, disegna: disegnaScheda });

  CasaNostra.sezioni.attivita = {
    aggiungi: aggiungi,
    modifica: modifica,
    alterna: alterna,
    elimina: elimina
  };
})(window.CasaNostra);
