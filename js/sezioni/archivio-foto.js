/*
 * Sezione Archivio foto — gruppo "Archivio foto" (ordine 70) nelle impostazioni (ticket #10).
 * La logica (ZIP STORE, CRC32, esportazione e importazione) sta in js/archivio-foto.js.
 * Non espone nulla in CasaNostra.sezioni.
 */
(function (CasaNostra) {
  'use strict';

  var ui = CasaNostra.ui;
  var archivio = CasaNostra.archivioFoto;

  function testoEsito(e) {
    return 'Importate ' + e.importate + ', già presenti ' + e.giaPresenti + ', non leggibili ' + e.nonLeggibili + '.';
  }

  function disegnaGruppo(corpo) {
    var esito = ui.el('div', { class: 'archivio-esito' });
    function mostraErrore(err, base) {
      CasaNostra.errori.registra(err, base);
      ui.svuota(esito).appendChild(ui.messaggioErrore(err, ''));
    }
    var pulsanteEsporta = ui.el('button', { type: 'button', class: 'pulsante pulsante-primario', testo: 'Esporta archivio foto' });
    pulsanteEsporta.addEventListener('click', function () {
      pulsanteEsporta.disabled = true;
      ui.svuota(esito);
      archivio.esporta().then(function (r) {
        ui.toast(r.quante === 1 ? 'Archivio con 1 foto scaricato.' : 'Archivio con ' + r.quante + ' foto scaricato.', { tipo: 'successo' });
      }, function (err) { mostraErrore(err, 'esportazione dell\'archivio foto'); })
        .then(function () { pulsanteEsporta.disabled = false; });
    });
    corpo.appendChild(ui.el('p', { class: 'aiuto', testo: 'L\'archivio foto è un file ZIP con tutte le foto, separato dal backup dati. Conservalo fuori dal tablet.' }));
    var campo = ui.el('input', {
      id: 'archivio-importa', class: 'archivio-campo', type: 'file', accept: '.zip,application/zip'
    });
    campo.addEventListener('change', function () {
      var file = campo.files && campo.files[0];
      if (!file) return;
      campo.disabled = true;
      ui.svuota(esito).appendChild(ui.el('p', { class: 'aiuto', testo: 'Importazione in corso…' }));
      archivio.importa(file).then(function (r) {
        ui.svuota(esito).appendChild(ui.el('p', { class: 'archivio-resoconto', role: 'status', testo: testoEsito(r) }));
      }, function (err) {
        if (err && err.esitoParziale) {
          err = CasaNostra.errori.perUtente(CasaNostra.errori.messaggio(err) + ' Prima dell\'interruzione: ' + testoEsito(err.esitoParziale));
        }
        mostraErrore(err, 'importazione dell\'archivio foto');
      }).then(function () {
        campo.value = '';
        campo.disabled = false;
      });
    });
    corpo.appendChild(ui.el('div', { class: 'impostazioni-riga' }, [pulsanteEsporta]));
    corpo.appendChild(ui.el('label', { class: 'etichetta', for: 'archivio-importa', testo: 'Importa archivio foto' }));
    corpo.appendChild(campo);
    corpo.appendChild(ui.el('p', { class: 'aiuto', testo: 'L\'importazione aggiunge le foto mancanti e salta quelle già presenti: non elimina mai foto.' }));
    corpo.appendChild(esito);
  }

  ui.registraGruppoImpostazioni({ id: 'archivio', titolo: 'Archivio foto', ordine: 70, disegna: disegnaGruppo });
})(window.CasaNostra);
