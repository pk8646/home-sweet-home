/*
 * CasaNostra.ui — guscio dell'interfaccia: registro di sezioni/schede/gruppi di impostazioni, router via hash,
 * barra di navigazione, orologio, toast, avvisi globali e piccoli aiuti per creare elementi in sicurezza.
 *
 * Il testo dell'utente si inserisce SOLO con textContent (ui.el(..., { testo: ... }) o figli stringa).
 *
 * Sezione (pagina #/id, voce di navigazione):
 *   CasaNostra.ui.registraSezione({ id: 'spesa', titolo: 'Spesa', icona: '🛒', ordine: 20,
 *     disegna: function (contenitore, contesto) {...},   // può restituire una Promise
 *     esci: function () {...},                           // facoltativa: pulizia quando si lascia la pagina
 *     alCambioGiorno: function (contesto) {...} });      // facoltativa (default: ridisegna se dipendeDallaData)
 *
 * Scheda della dashboard (disegnata in isolamento: un errore resta dentro la scheda):
 *   CasaNostra.ui.registraScheda({ id: 'spesa', titolo: 'Spesa', icona: '🛒', ordine: 50,
 *     dipendeDallaData: false, nascondibile: true,
 *     disegna: function (corpo, contesto) {...} });      // restituire false per non mostrare la scheda
 *
 * Gruppo nella pagina Impostazioni:
 *   CasaNostra.ui.registraGruppoImpostazioni({ id: 'localita', titolo: 'Località', ordine: 20, disegna: fn });
 *
 * contesto = { oggi: 'AAAA-MM-GG', adesso: Date, parametri: [...], ridisegna: fn }
 */
(function (CasaNostra) {
  'use strict';

  var sezioni = {};
  var schede = {};
  var gruppiImpostazioni = {};
  var vistaCorrente = null; // { sezione, contenitore, contesto }
  var contatoreDisegni = 0;
  var giornoMostrato = null;
  var avviata = false;

  // ---------- aiuti DOM ----------

  /**
   * Crea un elemento. attributi: { class, testo, on: { evento: fn }, ...altri attributi }.
   * Le proprietà booleane (disabled, hidden, checked, required...) si passano come true/false.
   * figli: nodo, stringa (diventa testo) o array di questi; null/undefined vengono saltati.
   */
  function el(tag, attributi, figli) {
    var nodo = document.createElement(tag);
    var a = attributi || {};
    Object.keys(a).forEach(function (k) {
      var v = a[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'testo') nodo.textContent = String(v);
      else if (k === 'class') nodo.className = v;
      else if (k === 'on') Object.keys(v).forEach(function (ev) { nodo.addEventListener(ev, v[ev]); });
      else if (k === 'value') nodo.value = v;
      else if (v === true) { nodo.setAttribute(k, ''); if (k in nodo) nodo[k] = true; }
      else nodo.setAttribute(k, String(v));
    });
    aggiungiFigli(nodo, figli);
    return nodo;
  }

  function aggiungiFigli(nodo, figli) {
    if (figli === null || figli === undefined) return;
    (Array.isArray(figli) ? figli : [figli]).forEach(function (f) {
      if (f === null || f === undefined || f === false) return;
      nodo.appendChild(typeof f === 'string' || typeof f === 'number' ? document.createTextNode(String(f)) : f);
    });
  }

  function svuota(nodo) {
    while (nodo.firstChild) nodo.removeChild(nodo.firstChild);
    return nodo;
  }

  /** Icona "⚠️ " decorativa (nascosta ai lettori di schermo) da mettere davanti a un messaggio d'avviso. */
  function iconaAvviso() {
    return el('span', { 'aria-hidden': 'true', testo: '⚠️ ' });
  }

  /** Fa scaricare un Blob con il nome dato (link `download` temporaneo; l'URL si revoca poco dopo). */
  function scaricaBlob(blob, nome) {
    var url = URL.createObjectURL(blob);
    var link = el('a', { href: url, download: nome, rel: 'noopener', hidden: true });
    document.body.appendChild(link);
    link.click();
    link.parentNode.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /** Link "Vedi tutti (N)" verso una sezione. */
  function linkVediTutti(idSezione, numero, testo) {
    return el('a', { class: 'vedi-tutti', href: '#/' + idSezione },
      (testo || 'Vedi tutti') + (numero !== undefined ? ' (' + numero + ')' : ''));
  }

  // ---------- toast ----------

  /** Notifica breve. opzioni: { tipo: 'info'|'successo'|'errore', durataMs, azione: { testo, esegui } } */
  function toast(testo, opzioni) {
    var o = opzioni || {};
    var area = document.getElementById('toast-area');
    if (!area) return null;
    var tipo = o.tipo || 'info';
    var nodo = el('div', { class: 'toast toast-' + tipo, role: tipo === 'errore' ? 'alert' : 'status' });
    nodo.appendChild(el('span', { class: 'toast-testo', testo: testo }));
    function chiudi() { if (nodo.parentNode) nodo.parentNode.removeChild(nodo); }
    if (o.azione) {
      nodo.appendChild(el('button', {
        type: 'button', class: 'pulsante pulsante-secondario toast-azione', testo: o.azione.testo,
        on: { click: function () { chiudi(); o.azione.esegui(); } }
      }));
    }
    nodo.appendChild(el('button', {
      type: 'button', class: 'toast-chiudi', 'aria-label': 'Chiudi notifica', testo: '✕', on: { click: chiudi }
    }));
    area.appendChild(nodo);
    while (area.children.length > 3) area.removeChild(area.firstChild);
    var durata = o.durataMs || (o.azione ? 15000 : tipo === 'errore' ? 7000 : 4000);
    setTimeout(chiudi, durata);
    return nodo;
  }

  // ---------- avvisi globali (es. IndexedDB non disponibile) ----------

  function avviso(id, testo, tipo) {
    var area = document.getElementById('avvisi-globali');
    if (!area) return;
    var esistente = document.getElementById('avviso-' + id);
    if (esistente) esistente.parentNode.removeChild(esistente);
    if (!testo) return;
    area.appendChild(el('p', { id: 'avviso-' + id, class: 'avviso avviso-' + (tipo || 'errore'), role: 'alert' }, [
      iconaAvviso(), testo
    ]));
  }

  // ---------- registro ----------

  function controllaDefinizione(def, tipo) {
    if (!def || !def.id || typeof def.disegna !== 'function') {
      throw new Error(tipo + ': servono almeno id e disegna()');
    }
  }

  function registraSezione(def) {
    controllaDefinizione(def, 'registraSezione');
    sezioni[def.id] = def;
    if (avviata) disegnaNavigazione();
  }

  function registraScheda(def) {
    controllaDefinizione(def, 'registraScheda');
    schede[def.id] = def;
  }

  function registraGruppoImpostazioni(def) {
    controllaDefinizione(def, 'registraGruppoImpostazioni');
    gruppiImpostazioni[def.id] = def;
  }

  function ordinati(mappa) {
    return Object.keys(mappa).map(function (k) { return mappa[k]; }).sort(function (a, b) {
      return (a.ordine || 0) - (b.ordine || 0);
    });
  }

  // ---------- router ----------

  function leggiRotta() {
    var h = (location.hash || '').replace(/^#\/?/, '');
    var parti = h.split('/').filter(Boolean).map(function (p) {
      try { return decodeURIComponent(p); } catch (e) { return p; }
    });
    return { id: parti[0] || 'home', parametri: parti.slice(1) };
  }

  function creaContesto(parametri, ridisegna) {
    var adesso = new Date();
    return { oggi: CasaNostra.date.oggi(adesso), adesso: adesso, parametri: parametri || [], ridisegna: ridisegna };
  }

  function segnaStato(stato) {
    document.documentElement.setAttribute('data-casa-nostra', stato);
  }

  function messaggioErrore(err, testoBase) {
    return el('p', { class: 'messaggio-errore', role: 'alert' }, [
      iconaAvviso(),
      testoBase + ' ' + CasaNostra.errori.messaggio(err)
    ]);
  }

  /** Disegna la vista indicata dall'hash corrente. */
  function disegnaVista(spostaFocus) {
    var numero = ++contatoreDisegni;
    var rotta = leggiRotta();
    var sezione = sezioni[rotta.id];
    var main = document.getElementById('contenuto');
    segnaStato('in-corso');

    if (vistaCorrente && vistaCorrente.sezione && vistaCorrente.sezione.esci) {
      try { vistaCorrente.sezione.esci(); } catch (e) { CasaNostra.errori.registra(e, 'uscita dalla sezione'); }
    }
    disegnaNavigazione();

    var contenitore = el('div', { class: 'vista vista-' + (sezione ? sezione.id : 'non-trovata') });
    var titolo = null;
    if (!sezione || sezione.id !== 'home') {
      titolo = el('h2', { class: 'vista-titolo', tabindex: '-1' }, sezione ? [
        el('span', { class: 'vista-icona', 'aria-hidden': 'true', testo: sezione.icona || '' }), ' ' + sezione.titolo
      ] : 'Pagina non trovata');
      contenitore.appendChild(titolo);
    }
    var corpo = el('div', { class: 'vista-corpo' });
    contenitore.appendChild(corpo);
    svuota(main).appendChild(contenitore);
    document.title = sezione && sezione.id !== 'home' ? sezione.titolo + ' · Casa Nostra' : 'Casa Nostra';

    function ridisegna() {
      if (numero !== contatoreDisegni) return Promise.resolve();
      return disegnaVista(false);
    }
    var contesto = creaContesto(rotta.parametri, ridisegna);
    vistaCorrente = { sezione: sezione, contenitore: corpo, contesto: contesto };
    if (spostaFocus) (titolo || main).focus();

    if (!sezione) {
      corpo.appendChild(el('p', {}, ['Questa pagina non esiste. ', el('a', { href: '#/', testo: 'Torna alla Home' })]));
      segnaStato('pronta');
      return Promise.resolve();
    }
    return Promise.resolve().then(function () {
      return sezione.disegna(corpo, contesto);
    }).catch(function (err) {
      CasaNostra.errori.registra(err, 'disegno della sezione ' + sezione.id);
      if (numero === contatoreDisegni) {
        svuota(corpo).appendChild(messaggioErrore(err, 'Non è stato possibile mostrare questa pagina.'));
      }
    }).then(function () {
      if (numero === contatoreDisegni) segnaStato('pronta');
    });
  }

  function disegnaNavigazione() {
    var nav = document.getElementById('navigazione');
    if (!nav) return;
    var attiva = leggiRotta().id;
    svuota(nav);
    var lista = el('ul', { class: 'navigazione-lista' });
    ordinati(sezioni).forEach(function (s) {
      if (s.navigazione === false) return;
      var link = el('a', { class: 'navigazione-voce', href: s.id === 'home' ? '#/' : '#/' + s.id }, [
        el('span', { class: 'navigazione-icona', 'aria-hidden': 'true', testo: s.icona || '•' }),
        el('span', { class: 'navigazione-testo', testo: s.titolo })
      ]);
      if (s.id === attiva) link.setAttribute('aria-current', 'page');
      lista.appendChild(el('li', {}, link));
    });
    nav.appendChild(lista);
  }

  /** Ridisegna la vista corrente (es. dopo un salvataggio). */
  function ridisegna() {
    return disegnaVista(false);
  }

  // ---------- orologio ----------

  function aggiornaOrologio() {
    var adesso = new Date();
    var ora = document.getElementById('orologio-ora');
    var data = document.getElementById('orologio-data');
    var oggi = CasaNostra.date.oggi(adesso);
    if (ora) ora.textContent = CasaNostra.date.ora(adesso);
    if (data) {
      var testo = CasaNostra.date.formattaLunga(oggi);
      data.textContent = testo.charAt(0).toUpperCase() + testo.slice(1);
    }
    if (giornoMostrato && giornoMostrato !== oggi) {
      giornoMostrato = oggi;
      cambioGiorno();
    }
    giornoMostrato = oggi;
  }

  function cambioGiorno() {
    if (!vistaCorrente || !vistaCorrente.sezione) return;
    var s = vistaCorrente.sezione;
    if (s.alCambioGiorno) {
      var contesto = creaContesto(vistaCorrente.contesto.parametri, vistaCorrente.contesto.ridisegna);
      Promise.resolve().then(function () { return s.alCambioGiorno(contesto); }).catch(function (e) {
        CasaNostra.errori.gestisci(e, 'cambio di giorno');
      });
    } else if (s.dipendeDallaData) {
      ridisegna();
    }
  }

  function avviaOrologio() {
    aggiornaOrologio();
    // Un aggiornamento ogni 60 secondi (allineato al cambio di minuto). Nessun altro polling.
    function prossimo() {
      setTimeout(function () { aggiornaOrologio(); prossimo(); }, 60000 - (Date.now() % 60000) + 20);
    }
    prossimo();
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') aggiornaOrologio();
    });
  }

  // ---------- intestazione e avvio ----------

  function impostaNomeCasa(nome) {
    var n = document.getElementById('nome-casa');
    if (n) n.textContent = nome || 'Casa Nostra';
  }

  function avvia() {
    avviata = true;
    avviaOrologio();
    window.addEventListener('hashchange', function () { disegnaVista(true); });
    // L'evento hashchange arriva dopo il clic: si segna subito "in-corso" così chi aspetta
    // data-casa-nostra="pronta" non vede ancora lo stato della vista precedente.
    document.addEventListener('click', function (ev) {
      if (ev.defaultPrevented || ev.button !== 0 || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) return;
      var link = ev.target && ev.target.closest ? ev.target.closest('a[href^="#"]') : null;
      if (link && !link.target && link.hash !== location.hash) segnaStato('in-corso');
    });
    return disegnaVista(false);
  }

  CasaNostra.ui = {
    el: el,
    svuota: svuota,
    iconaAvviso: iconaAvviso,
    scaricaBlob: scaricaBlob,
    linkVediTutti: linkVediTutti,
    messaggioErrore: messaggioErrore,
    toast: toast,
    avviso: avviso,
    registraSezione: registraSezione,
    registraScheda: registraScheda,
    registraGruppoImpostazioni: registraGruppoImpostazioni,
    sezioni: function () { return ordinati(sezioni); },
    schede: function () { return ordinati(schede); },
    gruppiImpostazioni: function () { return ordinati(gruppiImpostazioni); },
    creaContesto: creaContesto,
    ridisegna: ridisegna,
    impostaNomeCasa: impostaNomeCasa,
    aggiornaOrologio: aggiornaOrologio,
    avvia: avvia
  };
})(window.CasaNostra);
