/*
 * CasaNostra.dialoghi — dialoghi propri dell'app (niente confirm()/prompt()), accessibili e con focus gestito:
 * il focus entra nel dialogo, Esc annulla, alla chiusura torna all'elemento che l'aveva aperto.
 *
 *   CasaNostra.dialoghi.conferma({ titolo, messaggio, testoConferma: 'Elimina', pericolo: true,
 *                                  richiediTesto: 'CANCELLA' })            -> Promise<boolean>
 *   CasaNostra.dialoghi.modulo({ titolo, testoConferma: 'Salva', campi: [
 *       { nome: 'titolo', etichetta: 'Titolo', tipo: 'text', valore: '', obbligatorio: true },
 *       { nome: 'note', etichetta: 'Note', tipo: 'textarea' },
 *       { nome: 'categoria', etichetta: 'Categoria', tipo: 'select', opzioni: [{ valore: 'altro', testo: 'Altro' }] },
 *       { nome: 'data', etichetta: 'Data', tipo: 'date' }, { nome: 'ora', tipo: 'time' }, { nome: 'n', tipo: 'number', min: 1 }
 *     ], valida: function (valori) { return null; /* o un messaggio d'errore *\/ } })
 *                                                                          -> Promise<valori | null>
 *   I valori sono stringhe già ripulite dagli spazi esterni (checkbox: booleano).
 */
(function (CasaNostra) {
  'use strict';

  var el = function () { return CasaNostra.ui.el.apply(null, arguments); };
  var contatore = 0;

  /** Apre un <dialog> modale; `costruisci(dialogo, chiudi)` lo riempie. Risolve con il valore passato a chiudi(). */
  function apri(titolo, costruisci) {
    return new Promise(function (risolvi) {
      var idTitolo = 'dialogo-titolo-' + (++contatore);
      var precedente = document.activeElement;
      var dialogo = el('dialog', { class: 'dialogo', 'aria-labelledby': idTitolo });
      dialogo.appendChild(el('h2', { class: 'dialogo-titolo', id: idTitolo, testo: titolo }));
      var chiuso = false;
      function chiudi(valore) {
        if (chiuso) return;
        chiuso = true;
        try { if (dialogo.open && dialogo.close) dialogo.close(); } catch (e) { /* già chiuso */ }
        if (dialogo.parentNode) dialogo.parentNode.removeChild(dialogo);
        if (precedente && precedente.focus && document.contains(precedente)) precedente.focus();
        risolvi(valore);
      }
      dialogo.addEventListener('cancel', function (ev) { ev.preventDefault(); chiudi(null); });
      dialogo.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') { ev.preventDefault(); chiudi(null); }
      });
      var daFocalizzare = costruisci(dialogo, chiudi);
      document.body.appendChild(dialogo);
      if (typeof dialogo.showModal === 'function') {
        dialogo.showModal();
      } else {
        dialogo.setAttribute('open', '');
        dialogo.setAttribute('role', 'dialog');
        dialogo.setAttribute('aria-modal', 'true');
      }
      (daFocalizzare || dialogo).focus();
    });
  }

  function pulsanti(testoAnnulla, testoConferma, pericolo, annulla) {
    var conferma = el('button', {
      type: 'submit', class: 'pulsante ' + (pericolo ? 'pulsante-pericolo' : 'pulsante-primario'), testo: testoConferma
    });
    var bottoneAnnulla = el('button', {
      type: 'button', class: 'pulsante pulsante-secondario', testo: testoAnnulla, on: { click: annulla }
    });
    return { riga: el('div', { class: 'dialogo-pulsanti' }, [bottoneAnnulla, conferma]), conferma: conferma, annulla: bottoneAnnulla };
  }

  function conferma(o) {
    o = o || {};
    return apri(o.titolo || 'Confermi?', function (dialogo, chiudi) {
      var modulo = el('form', { class: 'dialogo-modulo', method: 'dialog', novalidate: true });
      if (o.messaggio) modulo.appendChild(el('p', { class: 'dialogo-messaggio', testo: o.messaggio }));
      var campo = null;
      if (o.richiediTesto) {
        var idCampo = 'dialogo-campo-' + contatore;
        campo = el('input', { id: idCampo, class: 'campo', type: 'text', autocomplete: 'off', autocapitalize: 'characters' });
        modulo.appendChild(el('label', { class: 'etichetta', for: idCampo, testo: 'Per confermare scrivi ' + o.richiediTesto }));
        modulo.appendChild(campo);
      }
      var p = pulsanti(o.testoAnnulla || 'Annulla', o.testoConferma || 'Conferma', o.pericolo, function () { chiudi(false); });
      if (campo) {
        p.conferma.disabled = true;
        campo.addEventListener('input', function () { p.conferma.disabled = campo.value.trim() !== o.richiediTesto; });
      }
      modulo.appendChild(p.riga);
      modulo.addEventListener('submit', function (ev) {
        ev.preventDefault();
        if (campo && campo.value.trim() !== o.richiediTesto) return;
        chiudi(true);
      });
      dialogo.appendChild(modulo);
      // Per le azioni distruttive il focus va su "Annulla", la scelta sicura.
      return campo || (o.pericolo ? p.annulla : p.conferma);
    }).then(function (v) { return v === true; });
  }

  function creaCampo(c, id) {
    var tipo = c.tipo || 'text';
    var attr = { id: id, name: c.nome, class: 'campo', required: !!c.obbligatorio };
    var campo;
    if (tipo === 'textarea') {
      campo = el('textarea', Object.assign(attr, { rows: c.righe || 3 }));
      campo.value = c.valore || '';
    } else if (tipo === 'select') {
      campo = el('select', attr, (c.opzioni || []).map(function (op) {
        return el('option', { value: op.valore, testo: op.testo });
      }));
      if (c.valore !== undefined && c.valore !== null) campo.value = c.valore;
    } else if (tipo === 'checkbox') {
      campo = el('input', Object.assign(attr, { type: 'checkbox', class: 'casella' }));
      campo.checked = !!c.valore;
    } else {
      campo = el('input', Object.assign(attr, {
        type: tipo, min: c.min, max: c.max, step: c.step, placeholder: c.segnaposto, autocomplete: 'off'
      }));
      if (c.valore !== undefined && c.valore !== null) campo.value = c.valore;
    }
    return campo;
  }

  function modulo(o) {
    o = o || {};
    return apri(o.titolo || 'Modifica', function (dialogo, chiudi) {
      var form = el('form', { class: 'dialogo-modulo', novalidate: true });
      var campi = {};
      var primo = null;
      (o.campi || []).forEach(function (c) {
        var id = 'dialogo-' + contatore + '-' + c.nome;
        var campo = creaCampo(c, id);
        campi[c.nome] = { def: c, nodo: campo };
        var etichetta = el('label', { class: 'etichetta', for: id, testo: (c.etichetta || c.nome) + (c.obbligatorio ? '' : ' (facoltativo)') });
        var riga = el('div', { class: 'dialogo-riga' + (c.tipo === 'checkbox' ? ' dialogo-riga-casella' : '') },
          c.tipo === 'checkbox' ? [campo, etichetta] : [etichetta, campo]);
        if (c.aiuto) riga.appendChild(el('p', { class: 'aiuto', testo: c.aiuto }));
        form.appendChild(riga);
        if (!primo) primo = campo;
      });
      var errore = el('p', { class: 'dialogo-errore', role: 'alert', hidden: true });
      form.appendChild(errore);
      var p = pulsanti(o.testoAnnulla || 'Annulla', o.testoConferma || 'Salva', false, function () { chiudi(null); });
      form.appendChild(p.riga);
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var valori = {};
        var mancante = null;
        Object.keys(campi).forEach(function (k) {
          var c = campi[k];
          valori[k] = c.def.tipo === 'checkbox' ? c.nodo.checked : String(c.nodo.value || '').trim();
          if (c.def.obbligatorio && valori[k] === '' && !mancante) mancante = c;
        });
        var messaggio = mancante ? 'Il campo "' + (mancante.def.etichetta || mancante.def.nome) + '" è obbligatorio.' : null;
        if (!messaggio && o.valida) messaggio = o.valida(valori);
        if (messaggio) {
          errore.textContent = messaggio;
          errore.hidden = false;
          (mancante ? mancante.nodo : primo || p.conferma).focus();
          return;
        }
        chiudi(valori);
      });
      dialogo.appendChild(form);
      return primo || p.conferma;
    });
  }

  CasaNostra.dialoghi = { conferma: conferma, modulo: modulo };
})(window.CasaNostra);
