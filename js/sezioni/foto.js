/*
 * CasaNostra.sezioni.foto — pagina #/foto (galleria con vista ingrandita) e scheda Foto della dashboard.
 * Elaborazione e persistenza stanno in CasaNostra.foto; qui solo interfaccia e URL temporanei.
 * La griglia usa solo le miniature; l'immagine piena si carica nella vista ingrandita.
 */
(function (CasaNostra) {
  'use strict';

  var ui = CasaNostra.ui;
  var foto = CasaNostra.foto;
  var contatore = 0;

  // URL temporanei: miniature della pagina, immagine piena della vista ingrandita, scheda della dashboard.
  var urlPagina = foto.gruppoUrl();
  var urlVista = foto.gruppoUrl();
  var urlScheda = foto.gruppoUrl();
  var vistaAperta = null; // { chiudi() }

  function testoScartate(scartate) {
    var n = scartate.length;
    return (n === 1 ? '1 file non aggiunto: ' : n + ' file non aggiunti: ') +
      scartate.map(function (s) { return s.nome + ' (' + s.motivo + ')'; }).join('; ') + '.';
  }

  // ---------- vista ingrandita ----------

  function apriVista(elenco, indice, dopoModifica) {
    chiudiVista();
    var idTitolo = 'foto-vista-titolo-' + (++contatore);
    var precedenteFocus = document.activeElement;
    var urlPiena = null;
    var richiesta = 0;
    var titolo = ui.el('h2', { class: 'foto-vista-titolo', id: idTitolo });
    var immagine = ui.el('img', { class: 'foto-vista-immagine', alt: '' });
    var posizione = ui.el('p', { class: 'foto-vista-posizione' });
    var dialogo;

    function corrente() { return elenco[indice]; }

    function mostra() {
      var m = corrente();
      var numero = ++richiesta;
      titolo.textContent = m.nome;
      immagine.alt = m.nome;
      posizione.textContent = (indice + 1) + ' di ' + elenco.length;
      bottoni.precedente.disabled = elenco.length < 2;
      bottoni.successiva.disabled = elenco.length < 2;
      return foto.blobPieno(m.id).then(function (blob) {
        if (numero !== richiesta || !dialogo.isConnected) return;
        if (urlPiena) urlVista.revoca(urlPiena);
        urlPiena = null;
        if (!blob) { immagine.removeAttribute('src'); return; }
        urlPiena = urlVista.crea(blob);
        immagine.src = urlPiena;
      });
    }

    function sposta(passo) {
      if (elenco.length < 2) return;
      indice = (indice + passo + elenco.length) % elenco.length;
      return mostra();
    }

    function chiudi() {
      if (!dialogo.isConnected) return;
      richiesta++;
      if (urlPiena) urlVista.revoca(urlPiena);
      urlPiena = null;
      immagine.removeAttribute('src');
      try { if (dialogo.open) dialogo.close(); } catch (e) { /* già chiuso */ }
      dialogo.parentNode.removeChild(dialogo);
      if (vistaAperta && vistaAperta.chiudi === chiudi) vistaAperta = null;
      if (precedenteFocus && precedenteFocus.focus && document.contains(precedenteFocus)) precedenteFocus.focus();
    }

    function scarica() {
      return foto.leggi(corrente().id).then(function (r) {
        if (!r) throw CasaNostra.errori.perUtente('La foto non esiste più.');
        foto.scarica(r);
      });
    }

    function elimina() {
      var m = corrente();
      return CasaNostra.dialoghi.confermaElimina({
        titolo: 'Eliminare la foto?', messaggio: '«' + m.nome + '» verrà eliminata da questo dispositivo.'
      }, function () {
        return foto.elimina(m.id).then(function () {
          elenco.splice(indice, 1);
          ui.toast('Foto eliminata.', { tipo: 'successo' });
          if (!elenco.length) chiudi();
          else { indice = indice % elenco.length; mostra(); }
          dopoModifica();
        });
      });
    }

    function bottone(testo, classe, fn, etichetta) {
      return ui.el('button', {
        type: 'button', class: 'pulsante ' + classe, testo: testo, 'aria-label': etichetta,
        on: { click: CasaNostra.errori.protetta(fn, 'vista della foto') }
      });
    }
    var bottoni = {
      precedente: bottone('‹ Precedente', 'pulsante-secondario', function () { return sposta(-1); }),
      successiva: bottone('Successiva ›', 'pulsante-secondario', function () { return sposta(1); }),
      scarica: bottone('Scarica', 'pulsante-secondario', scarica),
      elimina: bottone('Elimina', 'pulsante-pericolo', elimina),
      chiudi: bottone('Chiudi', 'pulsante-primario', chiudi)
    };

    dialogo = ui.el('dialog', { class: 'dialogo foto-vista', 'aria-labelledby': idTitolo }, [
      ui.el('div', { class: 'foto-vista-testa' }, [titolo, posizione]),
      ui.el('div', { class: 'foto-vista-cornice' }, immagine),
      ui.el('div', { class: 'foto-vista-comandi' }, [
        bottoni.precedente, bottoni.successiva, bottoni.scarica, bottoni.elimina, bottoni.chiudi
      ])
    ]);
    dialogo.addEventListener('cancel', function (ev) { ev.preventDefault(); chiudi(); });
    dialogo.addEventListener('keydown', function (ev) {
      if (ev.target !== dialogo && ev.target.tagName !== 'BUTTON') return;
      if (ev.key === 'ArrowLeft') { ev.preventDefault(); sposta(-1); }
      else if (ev.key === 'ArrowRight') { ev.preventDefault(); sposta(1); }
    });
    document.body.appendChild(dialogo);
    if (typeof dialogo.showModal === 'function') dialogo.showModal();
    else { dialogo.setAttribute('open', ''); dialogo.setAttribute('role', 'dialog'); dialogo.setAttribute('aria-modal', 'true'); }
    bottoni.chiudi.focus();
    vistaAperta = { chiudi: chiudi };
    return mostra();
  }

  function chiudiVista() { if (vistaAperta) vistaAperta.chiudi(); }

  // ---------- miniature della galleria: URL temporaneo solo mentre sono (quasi) sullo schermo ----------

  var osservatore = null;
  var MARGINE_OSSERVATORE = '300px 0px';

  function fermaOsservatore() {
    if (osservatore) osservatore.disconnect();
    osservatore = null;
  }

  /**
   * Restituisce mostra(img, blob). Con IntersectionObserver l'URL della miniatura si crea quando entra
   * nello schermo e si revoca quando ne esce; senza, si crea subito (e si revoca uscendo dalla pagina).
   */
  function osservaMiniature() {
    fermaOsservatore();
    if (typeof window.IntersectionObserver !== 'function') {
      return function (img, blob) { img.src = urlPagina.crea(blob); };
    }
    var blobDi = new Map();
    osservatore = new IntersectionObserver(function (voci) {
      voci.forEach(function (v) {
        var img = v.target;
        var attuale = img.getAttribute('src');
        if (v.isIntersecting && !attuale) {
          img.src = urlPagina.crea(blobDi.get(img));
        } else if (!v.isIntersecting && attuale) {
          img.removeAttribute('src');
          urlPagina.revoca(attuale);
        }
      });
    }, { rootMargin: MARGINE_OSSERVATORE });
    var questo = osservatore;
    return function (img, blob) {
      blobDi.set(img, blob);
      questo.observe(img);
    };
  }

  // ---------- pagina ----------

  function disegna(contenitore) {
    esci();
    var idCampo = 'foto-file-' + (++contatore);
    var campo = ui.el('input', { id: idCampo, class: 'visivamente-nascosto', type: 'file', accept: 'image/*', multiple: true });
    var esito = ui.el('div', { class: 'foto-esito', 'aria-live': 'polite' });
    var area = ui.el('div', { class: 'foto-area' });
    var elencoCorrente = [];
    // Presentazione (#9): visibile solo se la galleria contiene foto.
    var avviaPresentazione = ui.el('button', {
      type: 'button', class: 'pulsante pulsante-secondario', testo: 'Presentazione', hidden: true,
      on: { click: CasaNostra.errori.protetta(function () { return CasaNostra.presentazione.avvia(elencoCorrente.slice()); }, 'presentazione') }
    });
    contenitore.appendChild(ui.el('div', { class: 'foto-barra' }, [
      campo,
      ui.el('label', { class: 'pulsante pulsante-primario foto-aggiungi', for: idCampo, testo: 'Aggiungi foto' }),
      avviaPresentazione
    ]));
    contenitore.appendChild(esito);
    contenitore.appendChild(area);

    function disegnaGriglia() {
      return foto.elenco().then(function (elenco) {
        if (!area.isConnected) return;
        fermaOsservatore();
        urlPagina.revocaTutti();
        ui.svuota(area);
        elencoCorrente = elenco;
        avviaPresentazione.hidden = !elenco.length;
        if (!elenco.length) {
          area.appendChild(ui.el('p', { class: 'vuoto foto-vuoto' },
            'Nessuna foto per ora. Tocca «Aggiungi foto» e scegli una o più immagini: ' +
            'restano solo su questo dispositivo e non vengono inviate a nessuno.'));
          return;
        }
        var lista = ui.el('ul', { class: 'foto-griglia', 'aria-label': 'Foto' });
        var mostraMiniatura = osservaMiniature();
        elenco.forEach(function (m, i) {
          var miniatura = ui.el('img', { alt: '', loading: 'lazy', width: '150', height: '150' });
          if (m.miniatura) mostraMiniatura(miniatura, m.miniatura);
          lista.appendChild(ui.el('li', { class: 'foto-voce' }, ui.el('button', {
            type: 'button', class: 'foto-miniatura', 'aria-label': 'Apri ' + m.nome,
            on: { click: CasaNostra.errori.protetta(function () { return apriVista(elenco.slice(), i, disegnaGriglia); }, 'apertura della foto') }
          }, miniatura)));
        });
        area.appendChild(lista);
      });
    }

    function mostraEsito(r) {
      ui.svuota(esito);
      if (r.erroreQuota) {
        esito.appendChild(ui.el('p', { class: 'messaggio-errore', role: 'alert', testo: r.erroreQuota.message }));
      }
      if (r.scartate.length) {
        esito.appendChild(ui.el('p', { class: 'messaggio-errore', role: 'alert', testo: testoScartate(r.scartate) }));
      }
      if (r.aggiunte.length) {
        ui.toast(r.aggiunte.length === 1 ? 'Foto aggiunta.' : r.aggiunte.length + ' foto aggiunte.', { tipo: 'successo' });
      }
    }

    campo.addEventListener('change', CasaNostra.errori.protetta(function () {
      var files = Array.prototype.slice.call(campo.files || []);
      campo.value = '';
      if (!files.length) return;
      campo.disabled = true;
      ui.svuota(esito).appendChild(ui.el('p', { class: 'foto-stato', role: 'status', testo: 'Elaborazione delle foto in corso…' }));
      var totale = files.reduce(function (s, f) { return s + (f.size || 0); }, 0);
      return foto.stimaSpazio(totale).then(function (spazio) {
        if (spazio && spazio.scarso) {
          ui.avviso('foto-spazio', 'Lo spazio per le foto sta per finire: elimina qualche foto se il salvataggio non riesce.', 'info');
        }
        return foto.aggiungiFile(files);
      }).then(function (r) {
        mostraEsito(r);
        return disegnaGriglia();
      }).catch(function (e) {
        ui.svuota(esito);
        throw e;
      }).finally(function () { campo.disabled = false; });
    }, 'aggiunta delle foto'));

    return disegnaGriglia();
  }

  function esci() {
    fermaOsservatore();
    chiudiVista();
    CasaNostra.presentazione.chiudi();
    urlVista.revocaTutti();
    urlPagina.revocaTutti();
  }

  ui.registraSezione({ id: 'foto', titolo: 'Foto', icona: '🖼️', ordine: 60, disegna: disegna, esci: esci });

  // ---------- scheda della dashboard ----------

  ui.registraScheda({
    id: 'foto', titolo: 'Foto', icona: '🖼️', ordine: 70,
    disegna: function (corpo) {
      urlScheda.revocaTutti();
      return foto.elenco().then(function (elenco) {
        if (!elenco.length) {
          corpo.appendChild(ui.el('p', { class: 'vuoto', testo: 'Nessuna foto per ora.' }));
          corpo.appendChild(ui.el('a', { class: 'vedi-tutti', href: '#/foto', testo: 'Vai alla galleria' }));
          return;
        }
        var ultima = elenco[0];
        var miniatura = ui.el('img', { class: 'foto-scheda-miniatura', alt: 'Ultima foto aggiunta: ' + ultima.nome });
        if (ultima.miniatura) miniatura.src = urlScheda.crea(ultima.miniatura);
        corpo.appendChild(ui.el('a', { class: 'foto-scheda-link', href: '#/foto' }, miniatura));
        corpo.appendChild(ui.el('p', { class: 'foto-scheda-numero', testo: elenco.length === 1 ? '1 foto' : elenco.length + ' foto' }));
        corpo.appendChild(ui.linkVediTutti('foto', elenco.length, 'Vedi tutte'));
      });
    },
    esci: function () { urlScheda.revocaTutti(); }
  });

  CasaNostra.sezioni.foto = { apriVista: apriVista, chiudiVista: chiudiVista };
})(window.CasaNostra);
