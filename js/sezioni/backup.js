/*
 * Sezione Backup — interfaccia del Backup dati (ticket #11): gruppi "Backup dati" (ordine 60) e
 * "Ripristino iniziale" (ordine 90) nelle impostazioni, scheda "Promemoria backup" (ordine 2) sulla dashboard.
 * La logica (file, validazione, importazione, ripristino, regola del promemoria) sta in js/backup.js.
 * Non espone nulla in CasaNostra.sezioni.
 */
(function (CasaNostra) {
  'use strict';

  var ui = CasaNostra.ui;
  var date = CasaNostra.date;
  var backup = CasaNostra.backup;

  var ETICHETTE = {
    prodotti: ['prodotto', 'prodotti'], appuntamenti: ['appuntamento', 'appuntamenti'], attivita: ['attività', 'attività'],
    promemoriaCasa: ['promemoria casa', 'promemoria casa']
  };

  function testoRiepilogo(b) {
    var r = backup.riepilogo(b);
    var t = new Date(r.esportatoIl);
    var parti = Object.keys(ETICHETTE).map(function (n) {
      var c = r.conteggi[n];
      return c + ' ' + ETICHETTE[n][c === 1 ? 0 : 1];
    });
    return 'Backup del ' + date.formattaBreve(date.oggi(t)) + ' alle ' + date.ora(t) + ': ' + parti.join(', ') +
      (r.conteggi.impostazioni ? ' e le impostazioni' : '') + '. ' +
      'Tutti i dati attuali (spesa, agenda, attività, promemoria casa e impostazioni) verranno sostituiti. Le foto non vengono toccate.';
  }

  function testoUltimo(ultimoBackup, adesso) {
    var n = backup.giorniDallUltimo(ultimoBackup, adesso);
    if (n === null) return 'mai';
    if (n === 0) return 'oggi';
    if (n === 1) return 'ieri';
    return n + ' giorni fa';
  }

  // ---------- gruppo "Backup dati" ----------

  ui.registraGruppoImpostazioni({
    id: 'backup', titolo: 'Backup dati', ordine: 60,
    disegna: function (corpo, contesto) {
      return CasaNostra.impostazioni.leggi().then(function (imp) {
        var ultimo = ui.el('p', { class: 'backup-ultimo', testo: 'Ultimo backup: ' + testoUltimo(imp.ultimoBackup, contesto && contesto.adesso) });
        corpo.appendChild(ultimo);
        corpo.appendChild(ui.el('p', { class: 'aiuto', testo: 'Il backup dati è un file JSON con spesa, agenda, attività, ' +
          'promemoria casa e impostazioni. Non contiene le foto: per salvarle usa l\'archivio foto.' }));
        corpo.appendChild(ui.el('button', {
          type: 'button', class: 'pulsante pulsante-primario', testo: 'Esporta il backup dati',
          on: { click: CasaNostra.errori.protetta(function () {
            return backup.esporta().then(function (b) {
              ultimo.textContent = 'Ultimo backup: ' + testoUltimo(b.esportatoIl);
              ui.toast('Backup dati esportato.', { tipo: 'successo' });
            });
          }, 'esportazione del backup dati') }
        }));
        corpo.appendChild(campoImportazione());
        corpo.appendChild(ui.el('p', { class: 'aiuto', testo: 'Conserva i backup anche fuori dal tablet: copiali sul PC con il cavo USB, ' +
          'inviali per email a te stesso o salvali nel tuo cloud personale.' }));
      });
    }
  });

  function campoImportazione() {
    var id = 'backup-importa';
    var campo = ui.el('input', { id: id, type: 'file', accept: '.json,application/json', class: 'backup-file' });
    var errore = ui.el('p', { class: 'backup-errore', role: 'alert', hidden: true });
    function mostraErrore(testo) {
      errore.textContent = testo || '';
      errore.hidden = !testo;
    }
    campo.addEventListener('change', CasaNostra.errori.protetta(function () {
      var file = campo.files && campo.files[0];
      campo.value = '';
      mostraErrore(null);
      if (!file) return;
      return backup.leggiFile(file).then(function (testo) {
        var b;
        try {
          b = backup.leggi(testo);
        } catch (err) {
          CasaNostra.errori.registra(err, 'validazione del backup dati');
          mostraErrore(CasaNostra.errori.messaggio(err));
          return;
        }
        return CasaNostra.dialoghi.conferma({
          titolo: 'Importare il backup dati?', messaggio: testoRiepilogo(b), testoConferma: 'Importa'
        }).then(function (ok) {
          if (!ok) return;
          return backup.importa(b).then(function () {
            return CasaNostra.impostazioni.leggi();
          }).then(function (imp) {
            ui.impostaNomeCasa(imp.nomeVisualizzato);
            ui.toast('Backup dati importato.', { tipo: 'successo' });
            return ui.ridisegna();
          });
        });
      });
    }, 'importazione del backup dati'));
    return ui.el('div', { class: 'backup-importazione' }, [
      ui.el('label', { class: 'etichetta', for: id, testo: 'Importa un backup dati' }),
      campo,
      ui.el('p', { class: 'aiuto', testo: 'Prima di sostituire i dati attuali vedrai un riepilogo e ti verrà chiesta conferma.' }),
      errore
    ]);
  }

  // ---------- scheda "Promemoria backup" sulla dashboard ----------

  function testoPromemoria(dovuto) {
    if (dovuto.giorni === null) {
      return 'Non hai ancora fatto un backup dei dati. Se il browser viene ripulito, spesa, agenda e promemoria vanno persi.';
    }
    return 'L\'ultimo backup dei dati risale a ' + dovuto.giorni + ' giorni fa.';
  }

  ui.registraScheda({
    id: 'avviso-backup', titolo: 'Promemoria backup', icona: '💾', ordine: 2, nascondibile: false, dipendeDallaData: true,
    disegna: function (corpo, contesto) {
      return CasaNostra.impostazioni.leggi().then(function (imp) {
        return backup.promemoriaDovuto(imp, contesto.adesso);
      }).then(function (dovuto) {
        if (!dovuto) return false;
        corpo.appendChild(ui.el('p', { class: 'avviso-backup-testo', testo: testoPromemoria(dovuto) }));
        corpo.appendChild(ui.el('div', { class: 'avviso-backup-azioni' }, [
          ui.el('a', { class: 'pulsante pulsante-primario', href: '#/impostazioni', testo: 'Fai il backup' }),
          ui.el('button', {
            type: 'button', class: 'pulsante pulsante-secondario', testo: 'Ricordamelo fra ' + backup.GIORNI_POSTICIPO + ' giorni',
            on: { click: CasaNostra.errori.protetta(function () {
              return backup.posticipaPromemoria().then(function () { return contesto.ridisegna(); });
            }, 'posticipo dell\'avviso di backup') }
          })
        ]));
      });
    }
  });

  // ---------- gruppo "Ripristino iniziale" ----------

  ui.registraGruppoImpostazioni({
    id: 'ripristino', titolo: 'Ripristino iniziale', ordine: 90,
    disegna: function (corpo) {
      corpo.appendChild(ui.el('p', { class: 'aiuto', testo: 'Cancella tutto da questo dispositivo: spesa, agenda, attività, ' +
        'promemoria casa, impostazioni e foto. Prima esporta il backup dati e l\'archivio foto.' }));
      corpo.appendChild(ui.el('button', {
        type: 'button', class: 'pulsante pulsante-pericolo', testo: 'Cancella tutto',
        on: { click: CasaNostra.errori.protetta(function () {
          return CasaNostra.dialoghi.conferma({
            titolo: 'Cancellare tutto?',
            messaggio: 'Verranno eliminati definitivamente tutti i dati, le impostazioni e le foto. Non si può annullare: ' +
              'se non l\'hai ancora fatto, esporta prima il backup dati e l\'archivio foto.',
            testoConferma: 'Cancella tutto', pericolo: true, richiediTesto: 'CANCELLA'
          }).then(function (ok) {
            if (!ok) return;
            return backup.ripristinoIniziale().then(function () {
              history.replaceState(null, '', location.pathname + location.search + '#/');
              location.reload();
            });
          });
        }, 'ripristino iniziale') }
      }));
    }
  });
})(window.CasaNostra);
