/*
 * CasaNostra.sezioni.impostazioni — pagina #/impostazioni, scheda di benvenuto e "schermo acceso".
 *
 * La pagina è composta dai gruppi registrati con CasaNostra.ui.registraGruppoImpostazioni({ id, titolo,
 * ordine, disegna(corpo, contesto) }), così ogni ticket aggiunge il proprio gruppo dal proprio file
 * (es. Località in js/sezioni/meteo.js, Backup in un suo file). Ogni gruppo è disegnato in isolamento.
 * Ordini suggeriti: generali 10, località 20, dashboard 30, schermo 40, backup 60, archivio foto 70,
 * privacy 80, ripristino iniziale 90.
 *
 * Scheda "Benvenuti" (ordine 1, non nascondibile): compare finché impostazioni.benvenutoVisto è false.
 */
(function (CasaNostra) {
  'use strict';

  var ui = CasaNostra.ui;

  // ---------- testo sulla privacy (stesso testo nel benvenuto e nelle impostazioni) ----------

  var PRIVACY = [
    'I dati di Casa Nostra restano nel browser di questo dispositivo: non vengono inviati a nessun server.',
    'Cancellare i dati del sito dal browser o ripristinare il tablet li elimina definitivamente.',
    'Fare il backup spetta a te: esporta regolarmente un backup dati dalle Impostazioni.',
    'Non c\'è sincronizzazione fra dispositivi: ogni tablet, telefono o computer ha i propri dati.'
  ];

  function testoPrivacy() {
    return ui.el('ul', { class: 'privacy-elenco' }, PRIVACY.map(function (riga) { return ui.el('li', { testo: riga }); }));
  }

  // ---------- scheda di benvenuto ----------

  ui.registraScheda({
    id: 'benvenuto', titolo: 'Benvenuti', icona: '👋', ordine: 1, nascondibile: false,
    disegna: function (corpo) {
      return CasaNostra.impostazioni.leggi().then(function (imp) {
        if (imp.benvenutoVisto) return false;
        corpo.appendChild(testoPrivacy());
        corpo.appendChild(ui.el('div', { class: 'benvenuto-azioni' }, [
          ui.el('button', {
            type: 'button', class: 'pulsante pulsante-secondario', testo: 'Imposta nome e località',
            on: { click: function () { location.hash = '#/impostazioni'; } }
          }),
          ui.el('button', {
            type: 'button', class: 'pulsante pulsante-primario', testo: 'Ho capito',
            on: { click: CasaNostra.errori.protetta(function () {
              return CasaNostra.impostazioni.aggiorna({ benvenutoVisto: true }).then(function () { return ui.ridisegna(); });
            }, 'chiusura del benvenuto') }
          })
        ]));
      });
    }
  });

  // ---------- gruppo "Generali": nome mostrato ----------

  ui.registraGruppoImpostazioni({
    id: 'generali', titolo: 'Generali', ordine: 10,
    disegna: function (corpo) {
      return CasaNostra.impostazioni.leggi().then(function (imp) {
        var campo = ui.el('input', {
          id: 'impostazioni-nome', class: 'campo', type: 'text', autocomplete: 'off', maxlength: '60',
          placeholder: 'Es. Famiglia Rossi', value: imp.nomeVisualizzato || ''
        });
        var modulo = ui.el('form', { class: 'impostazioni-nome', novalidate: true }, [
          ui.el('label', { class: 'etichetta', for: 'impostazioni-nome', testo: 'Nome mostrato' }),
          ui.el('div', { class: 'impostazioni-riga' }, [
            campo,
            ui.el('button', { type: 'submit', class: 'pulsante pulsante-primario', testo: 'Salva il nome' })
          ]),
          ui.el('p', { class: 'aiuto', testo: 'Compare in alto nella dashboard. Lascialo vuoto per "Casa Nostra".' })
        ]);
        modulo.addEventListener('submit', CasaNostra.errori.protetta(function (ev) {
          ev.preventDefault();
          var nome = campo.value.trim().replace(/\s+/g, ' ');
          return CasaNostra.impostazioni.aggiorna({ nomeVisualizzato: nome }).then(function () {
            campo.value = nome;
            ui.impostaNomeCasa(nome);
            ui.toast('Nome salvato.', { tipo: 'successo' });
          });
        }, 'salvataggio del nome'));
        corpo.appendChild(modulo);
      });
    }
  });

  // ---------- gruppo "Schede della dashboard": visibilità e ordine delle schede spostabili ----------

  /** Gli id delle schede spostabili (non fisse) nell'ordine delle schede dato da ordineSchede. */
  function ordineSpostabili(ordineSchede) {
    return CasaNostra.impostazioni.idSpostabili(ui.schede(), { ordineSchede: ordineSchede });
  }

  /** Funzione che, dato un ordine, restituisce l'ordine con la scheda idScheda scambiata con la vicina (passo -1 o +1). */
  function scambio(idScheda, passo) {
    return function (ordine) {
      var o = ordine.slice();
      var i = o.indexOf(idScheda);
      var j = i + passo;
      if (i < 0 || j < 0 || j >= o.length) return o;
      o[i] = o[j];
      o[j] = idScheda;
      return o;
    };
  }

  function rigaScheda(def, imp, sposta) {
    var id = 'impostazioni-scheda-' + def.id;
    var casella = ui.el('input', { id: id, type: 'checkbox', class: 'casella', checked: CasaNostra.impostazioni.schedaVisibile(imp, def.id) });
    casella.addEventListener('change', CasaNostra.errori.protetta(function () {
      var visibile = casella.checked;
      casella.disabled = true;
      // aggiorna() è in coda: due interruttori toccati in rapida successione non si sovrascrivono a vicenda.
      return CasaNostra.impostazioni.aggiorna(function (attuali) {
        var mappa = Object.assign({}, attuali.schedeVisibili);
        if (visibile) delete mappa[def.id]; else mappa[def.id] = false;
        return { schedeVisibili: mappa };
      }).catch(function (err) {
        casella.checked = !visibile;
        throw err;
      }).then(function () { casella.disabled = false; }, function (err) { casella.disabled = false; throw err; });
    }, 'visibilità della scheda ' + def.id));

    // ▲ sulla prima riga e ▼ sull'ultima sono disattivati con aria-disabled (non disabled): il pulsante appena
    // premuto tiene il focus anche quando la scheda arriva al bordo.
    function pulsante(passo, simbolo, verso) {
      var p = ui.el('button', {
        type: 'button', class: 'pulsante-icona impostazioni-sposta', 'aria-label': 'Sposta ' + def.titolo + ' ' + verso, testo: simbolo
      });
      p.addEventListener('click', CasaNostra.errori.protetta(function () {
        if (p.getAttribute('aria-disabled') === 'true') return;
        return sposta(scambio(def.id, passo));
      }, 'ordine delle schede'));
      return p;
    }

    return ui.el('li', { class: 'impostazioni-scheda', 'data-scheda': def.id }, [
      ui.el('label', { class: 'impostazioni-interruttore', for: id }, [
        casella,
        ui.el('span', { 'aria-hidden': 'true', testo: def.icona || '' }),
        ui.el('span', { testo: def.titolo })
      ]),
      ui.el('span', { class: 'impostazioni-sposta-pulsanti' }, [pulsante(-1, '▲', 'su'), pulsante(1, '▼', 'giù')])
    ]);
  }

  ui.registraGruppoImpostazioni({
    id: 'dashboard', titolo: 'Schede della dashboard', ordine: 30,
    disegna: function (corpo) {
      if (!ordineSpostabili([]).length) {
        corpo.appendChild(ui.el('p', { class: 'vuoto', testo: 'Nessuna scheda da configurare.' }));
        return;
      }
      return CasaNostra.impostazioni.leggi().then(function (imp) {
        var definizioni = {};
        ui.schede().forEach(function (def) { definizioni[def.id] = def; });
        var righe = {};
        var ordineSalvato = ordineSpostabili(imp.ordineSchede);
        var elenco = ui.el('ul', { class: 'impostazioni-schede' }, ordineSalvato.map(function (idScheda) {
          righe[idScheda] = rigaScheda(definizioni[idScheda], imp, cambiaOrdine);
          return righe[idScheda];
        }));

        function ordineSulloSchermo() {
          return Array.prototype.map.call(elenco.children, function (li) { return li.getAttribute('data-scheda'); });
        }

        /** Mette le righe nell'ordine dato; il pulsante che aveva il focus lo riprende. */
        function mostra(ordine) {
          var attivo = document.activeElement;
          ordine.forEach(function (idScheda, i) {
            if (elenco.children[i] !== righe[idScheda]) elenco.insertBefore(righe[idScheda], elenco.children[i] || null);
          });
          if (attivo && attivo !== document.activeElement && elenco.contains(attivo)) attivo.focus();
          ordine.forEach(function (idScheda, i) {
            var pulsanti = righe[idScheda].querySelectorAll('.impostazioni-sposta');
            pulsanti[0].setAttribute('aria-disabled', String(i === 0));
            pulsanti[1].setAttribute('aria-disabled', String(i === ordine.length - 1));
          });
        }

        /*
         * calcola(ordine) -> nuovo ordine. Lo schermo cambia subito; il salvataggio è in coda e applica la stessa
         * modifica all'ordine salvato. Quando la coda si svuota lo schermo mostra l'ordine salvato davvero.
         */
        function cambiaOrdine(calcola) {
          mostra(ordineSpostabili(calcola(ordineSulloSchermo())));
          return CasaNostra.impostazioni.cambiaOrdineSchede(function (attuali) {
            return calcola(ordineSpostabili(attuali.ordineSchede));
          }, function (salvate) {
            mostra(ordineSpostabili(salvate.ordineSchede));
          });
        }

        mostra(ordineSalvato);
        corpo.appendChild(ui.el('p', { class: 'aiuto', testo: 'Data e ora restano sempre visibili. Le sezioni nascoste restano raggiungibili dalla navigazione. Con ▲ e ▼ scegli l\'ordine delle schede.' }));
        corpo.appendChild(elenco);
        corpo.appendChild(ui.el('button', {
          type: 'button', class: 'pulsante pulsante-secondario impostazioni-ripristina-ordine', testo: 'Ripristina ordine predefinito',
          on: { click: CasaNostra.errori.protetta(function () {
            return cambiaOrdine(function () { return []; });
          }, 'ripristino dell\'ordine delle schede') }
        }));
      });
    }
  });

  // ---------- "Mantieni lo schermo acceso" (Screen Wake Lock) ----------

  var schermo = { attivo: false, sentinella: null };

  function wakeLockDisponibile() {
    return !!(navigator.wakeLock && typeof navigator.wakeLock.request === 'function');
  }

  function acquisisci() {
    if (!schermo.attivo || !wakeLockDisponibile() || document.visibilityState !== 'visible') return Promise.resolve();
    if (schermo.sentinella && !schermo.sentinella.released) return Promise.resolve();
    return navigator.wakeLock.request('screen').then(function (s) {
      if (!schermo.attivo) return s.release();
      schermo.sentinella = s;
    }).catch(function (err) {
      // Il browser può rifiutare (batteria scarica, pagina non visibile...): non è un errore dell'utente.
      CasaNostra.errori.registra(err, 'richiesta del wake lock');
    });
  }

  function rilascia() {
    var s = schermo.sentinella;
    schermo.sentinella = null;
    if (s && !s.released) return Promise.resolve(s.release()).catch(function (err) { CasaNostra.errori.registra(err, 'rilascio del wake lock'); });
    return Promise.resolve();
  }

  function impostaSchermoAcceso(attivo) {
    schermo.attivo = !!attivo;
    return schermo.attivo ? acquisisci() : rilascia();
  }

  if (wakeLockDisponibile()) {
    // Il browser rilascia il wake lock quando la pagina viene nascosta: lo si riacquisisce al ritorno.
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') acquisisci();
    });
    CasaNostra.alPronto(function () {
      return CasaNostra.impostazioni.leggi().then(function (imp) { return impostaSchermoAcceso(imp.schermoAcceso); });
    });
  }

  ui.registraGruppoImpostazioni({
    id: 'schermo', titolo: 'Schermo', ordine: 40,
    disegna: function (corpo) {
      var sezione = corpo.parentNode;
      if (!wakeLockDisponibile()) {
        if (sezione) sezione.hidden = true; // API assente: il controllo non compare
        return;
      }
      return CasaNostra.impostazioni.leggi().then(function (imp) {
        var casella = ui.el('input', { id: 'impostazioni-schermo-acceso', type: 'checkbox', class: 'casella', checked: !!imp.schermoAcceso });
        casella.addEventListener('change', CasaNostra.errori.protetta(function () {
          var attivo = casella.checked;
          return CasaNostra.impostazioni.aggiorna({ schermoAcceso: attivo }).then(function () {
            return impostaSchermoAcceso(attivo);
          }, function (err) {
            casella.checked = !attivo;
            throw err;
          });
        }, 'impostazione dello schermo acceso'));
        corpo.appendChild(ui.el('label', { class: 'impostazioni-interruttore', for: 'impostazioni-schermo-acceso' }, [
          casella, ui.el('span', { testo: 'Mantieni lo schermo acceso' })
        ]));
        corpo.appendChild(ui.el('p', { class: 'aiuto', testo: 'Utile sul tablet di casa: lo schermo non si spegne finché Casa Nostra è aperta.' }));
      });
    }
  });

  // ---------- gruppo "Privacy e dati": lo stesso testo del benvenuto, sempre consultabile ----------

  ui.registraGruppoImpostazioni({
    id: 'privacy', titolo: 'Privacy e dati', ordine: 80,
    disegna: function (corpo) { corpo.appendChild(testoPrivacy()); }
  });

  // ---------- pagina ----------

  function disegnaGruppo(def, contenitore, contesto) {
    var idTitolo = 'impostazioni-' + def.id;
    var corpo = ui.el('div', { class: 'gruppo-corpo' });
    contenitore.appendChild(ui.el('section', { class: 'gruppo-impostazioni gruppo-' + def.id, 'aria-labelledby': idTitolo }, [
      ui.el('h3', { class: 'gruppo-titolo', id: idTitolo, testo: def.titolo }),
      corpo
    ]));
    return Promise.resolve().then(function () { return def.disegna(corpo, contesto); }).catch(function (err) {
      CasaNostra.errori.registra(err, 'gruppo di impostazioni ' + def.id);
      ui.svuota(corpo).appendChild(ui.messaggioErrore(err, 'Non è stato possibile mostrare queste impostazioni.'));
    });
  }

  ui.registraSezione({
    id: 'impostazioni', titolo: 'Impostazioni', icona: '⚙️', ordine: 90,
    disegna: function (contenitore, contesto) {
      var gruppi = ui.gruppiImpostazioni();
      if (!gruppi.length) {
        contenitore.appendChild(ui.el('p', { class: 'vuoto', testo: 'Le impostazioni sono in arrivo.' }));
        return;
      }
      return Promise.all(gruppi.map(function (g) { return disegnaGruppo(g, contenitore, contesto); }));
    }
  });

  CasaNostra.sezioni.impostazioni = { testoPrivacy: testoPrivacy };
})(window.CasaNostra);
