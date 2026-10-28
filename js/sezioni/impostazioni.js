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
 * Per i test che non la vogliono: apri({ scriptIniziale: () => { window.CasaNostraSenzaBenvenuto = true; } }).
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
      if (window.CasaNostraSenzaBenvenuto === true) return false;
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

  // ---------- gruppo "Schede della dashboard": un interruttore per ogni scheda nascondibile ----------

  var codaSchede = Promise.resolve();

  ui.registraGruppoImpostazioni({
    id: 'dashboard', titolo: 'Schede della dashboard', ordine: 30,
    disegna: function (corpo) {
      var schede = ui.schede().filter(function (def) { return def.nascondibile !== false; });
      if (!schede.length) {
        corpo.appendChild(ui.el('p', { class: 'vuoto', testo: 'Nessuna scheda da configurare.' }));
        return;
      }
      return CasaNostra.impostazioni.leggi().then(function (imp) {
        corpo.appendChild(ui.el('p', { class: 'aiuto', testo: 'Data e ora restano sempre visibili. Le sezioni nascoste restano raggiungibili dalla navigazione.' }));
        corpo.appendChild(ui.el('ul', { class: 'impostazioni-schede' }, schede.map(function (def) {
          var id = 'impostazioni-scheda-' + def.id;
          var casella = ui.el('input', { id: id, type: 'checkbox', class: 'casella', checked: CasaNostra.impostazioni.schedaVisibile(imp, def.id) });
          casella.addEventListener('change', CasaNostra.errori.protetta(function () {
            var visibile = casella.checked;
            casella.disabled = true;
            // In coda: due interruttori toccati in rapida successione non si sovrascrivono a vicenda.
            codaSchede = codaSchede.catch(function () {}).then(function () {
              return CasaNostra.impostazioni.leggi();
            }).then(function (attuali) {
              var mappa = Object.assign({}, attuali.schedeVisibili);
              if (visibile) delete mappa[def.id]; else mappa[def.id] = false;
              return CasaNostra.impostazioni.aggiorna({ schedeVisibili: mappa });
            });
            return codaSchede.catch(function (err) {
              casella.checked = !visibile;
              throw err;
            }).then(function () { casella.disabled = false; }, function (err) { casella.disabled = false; throw err; });
          }, 'visibilità della scheda ' + def.id));
          return ui.el('li', {}, ui.el('label', { class: 'impostazioni-interruttore', for: id }, [
            casella,
            ui.el('span', { 'aria-hidden': 'true', testo: def.icona || '' }),
            ui.el('span', { testo: def.titolo })
          ]));
        })));
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
