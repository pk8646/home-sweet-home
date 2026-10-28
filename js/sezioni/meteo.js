/*
 * CasaNostra.sezioni.meteo — scheda Meteo della dashboard e gruppo "Località del meteo" nelle impostazioni.
 * Non ha una pagina propria. La logica (richieste, copia, limiti) sta in js/meteo.js.
 */
(function (CasaNostra) {
  'use strict';

  var ui = CasaNostra.ui;
  var meteo = CasaNostra.meteo;
  var GIORNI_BREVI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

  function gradi(x) { return Math.round(x) + '°'; }

  function giornoBreve(iso) {
    var p = iso.split('-').map(Number);
    return GIORNI_BREVI[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()] + ' ' + CasaNostra.date.formattaGiornoMese(iso);
  }

  function disegnaDati(contenitore, localita, dati) {
    var a = dati.attuale;
    var cond = meteo.condizione(a.codice);
    contenitore.appendChild(ui.el('p', { class: 'meteo-localita', testo: localita.nome }));
    contenitore.appendChild(ui.el('div', { class: 'meteo-attuale' }, [
      ui.el('span', { class: 'meteo-emoji', 'aria-hidden': 'true', testo: cond.emoji }),
      ui.el('span', { class: 'meteo-temperatura', testo: gradi(a.temperatura) }),
      ui.el('span', { class: 'meteo-condizione', testo: cond.testo })
    ]));
    contenitore.appendChild(ui.el('ul', { class: 'meteo-dettagli' }, [
      ui.el('li', { testo: 'Percepita ' + gradi(a.percepita) }),
      ui.el('li', { testo: 'Umidità ' + Math.round(a.umidita) + '%' }),
      ui.el('li', { testo: 'Vento ' + Math.round(a.vento) + ' km/h' })
    ]));
    contenitore.appendChild(ui.el('ul', { class: 'meteo-giorni', 'aria-label': 'Previsioni dei prossimi giorni' }, dati.giorni.map(function (g) {
      var c = meteo.condizione(g.codice);
      return ui.el('li', { class: 'meteo-giorno' }, [
        ui.el('span', { class: 'meteo-giorno-data', testo: giornoBreve(g.data) }),
        ui.el('span', { class: 'meteo-emoji', 'aria-hidden': 'true', testo: c.emoji }),
        ui.el('span', { class: 'meteo-giorno-condizione', testo: c.testo }),
        ui.el('span', { class: 'meteo-giorno-temperature' }, [
          ui.el('span', { class: 'meteo-minima', testo: 'min ' + gradi(g.minima) }),
          ' ',
          ui.el('span', { class: 'meteo-massima', testo: 'max ' + gradi(g.massima) })
        ])
      ]);
    })));
  }

  function due(n) { return (n < 10 ? '0' : '') + n; }

  /** 'Aggiornato alle HH:MM del GG/MM' (ora locale del dispositivo). */
  function testoAggiornato(ms) {
    var d = new Date(ms);
    return 'Aggiornato alle ' + due(d.getHours()) + ':' + due(d.getMinutes()) + ' del ' + due(d.getDate()) + '/' + due(d.getMonth() + 1);
  }

  // ---------- scheda della dashboard ----------

  var CONTROLLO_MS = 60 * 1000;
  var attiva = null; // { area, localita, copia, errore, inCorso, timer }

  function aggiornaPulsante(s) {
    clearTimeout(s.sblocco);
    var attesa = meteo.attesaManuale();
    s.pulsante.disabled = !!s.inCorso || attesa > 0;
    s.pulsante.title = attesa > 0 ? 'Si può aggiornare di nuovo tra poco' : '';
    if (attesa > 0) s.sblocco = setTimeout(function () { if (attiva === s) aggiornaPulsante(s); }, attesa + 50);
  }

  function disegnaStato(s) {
    aggiornaPulsante(s);
    var area = ui.svuota(s.area);
    if (s.copia) {
      disegnaDati(area, s.copia.localita.nome ? s.copia.localita : s.localita, s.copia.dati);
      area.appendChild(ui.el('p', { class: 'meteo-aggiornato', testo: testoAggiornato(s.copia.salvataIl) }));
      if (s.errore) {
        area.appendChild(ui.el('p', { class: 'meteo-avviso', role: 'status' }, [
          ui.el('span', { 'aria-hidden': 'true', testo: '⚠️ ' }),
          'Non è stato possibile aggiornare il meteo. ' + CasaNostra.errori.messaggio(s.errore)
        ]));
      }
    } else if (s.errore) {
      area.appendChild(ui.messaggioErrore(s.errore, 'Meteo non disponibile.'));
    } else {
      area.appendChild(ui.el('p', { class: 'vuoto', testo: 'Caricamento del meteo…' }));
    }
  }

  function richiedi(s) {
    if (s.inCorso) return s.inCorso;
    var promessa = meteo.aggiorna(s.localita).then(function (copia) {
      s.copia = copia;
      s.errore = null;
    }, function (err) {
      CasaNostra.errori.registra(err, 'aggiornamento del meteo');
      s.errore = err;
    }).then(function () {
      s.inCorso = null;
      if (attiva === s) disegnaStato(s);
    });
    s.inCorso = promessa;
    aggiornaPulsante(s);
    return promessa;
  }

  function aggiornaAMano(s) {
    if (s.inCorso || meteo.attesaManuale() > 0) { aggiornaPulsante(s); return; }
    return richiedi(s);
  }

  function paginaVisibile() { return document.visibilityState !== 'hidden'; }

  function controlla(s, apertura) {
    if (attiva !== s || s.inCorso) return;
    // Una richiesta già partita (es. dalla scelta della località) si segue comunque.
    if (meteo.inCorso(s.localita)) { richiedi(s); return; }
    if (!paginaVisibile()) return;
    if (meteo.aggiornamentoDovuto(s.localita, { apertura: apertura })) { richiedi(s); return; }
    if (apertura && !s.copia) {
      s.errore = meteo.ultimoErrore(s.localita) ||
        CasaNostra.errori.perUtente('I dati non sono ancora arrivati: riprova con «Aggiorna» fra un minuto.');
      disegnaStato(s);
    }
  }

  function alCambioVisibilita() { if (attiva) controlla(attiva, false); }

  function esciScheda() {
    if (!attiva) return;
    clearInterval(attiva.timer);
    clearTimeout(attiva.sblocco);
    attiva = null;
    document.removeEventListener('visibilitychange', alCambioVisibilita);
  }

  function disegnaScheda(corpo) {
    esciScheda();
    var area = ui.el('div', { class: 'meteo-area', 'aria-live': 'polite' });
    var pulsante = ui.el('button', { type: 'button', class: 'pulsante pulsante-secondario meteo-aggiorna', testo: 'Aggiorna', disabled: true });
    corpo.appendChild(area);
    corpo.appendChild(ui.el('div', { class: 'meteo-azioni' }, [pulsante]));
    return CasaNostra.impostazioni.leggi().then(function (imp) {
      var s = { area: area, pulsante: pulsante, localita: imp.localita, copia: meteo.copiaPer(imp.localita), errore: null, inCorso: null };
      pulsante.addEventListener('click', CasaNostra.errori.protetta(function () { return aggiornaAMano(s); }, 'aggiornamento del meteo'));
      attiva = s;
      disegnaStato(s);
      s.timer = setInterval(function () { controlla(s, false); }, CONTROLLO_MS);
      document.addEventListener('visibilitychange', alCambioVisibilita);
      controlla(s, true);
    });
  }

  ui.registraScheda({ id: 'meteo', titolo: 'Meteo', icona: '🌤️', ordine: 10, disegna: disegnaScheda, esci: esciScheda });

  // ---------- gruppo "Località del meteo" nelle impostazioni ----------

  var contatore = 0;

  function campo(etichetta, attributi) {
    var id = 'localita-' + (attributi.name || 'campo') + '-' + (++contatore);
    var input = ui.el('input', Object.assign({ id: id, class: 'campo', type: 'text', autocomplete: 'off' }, attributi));
    return { input: input, nodo: ui.el('div', { class: 'localita-campo' }, [ui.el('label', { class: 'etichetta', for: id, testo: etichetta }), input]) };
  }

  /** Salva la località e aggiorna subito il meteo (anche se la copia precedente era recente: è un altro luogo). */
  function salvaLocalita(localita) {
    return CasaNostra.impostazioni.aggiorna({ localita: localita }).then(function (imp) {
      meteo.aggiorna(imp.localita).catch(function (err) {
        CasaNostra.errori.registra(err, 'meteo della nuova località');
      });
      ui.toast('Località del meteo: ' + imp.localita.nome + '.', { tipo: 'successo' });
      return imp.localita;
    });
  }

  function disegnaLocalita(corpo) {
    return CasaNostra.impostazioni.leggi().then(function (imp) {
      var attuale = ui.el('p', { class: 'localita-attuale' });
      var nome = campo('Nome della località (facoltativo)', { name: 'nome', maxlength: '80' });
      var lat = campo('Latitudine', { name: 'latitudine', inputmode: 'decimal' });
      var lon = campo('Longitudine', { name: 'longitudine', inputmode: 'decimal' });

      function mostra(localita) {
        attuale.textContent = 'Località attuale: ' + localita.nome + ' (' + localita.latitudine + ', ' + localita.longitudine + ')';
        nome.input.value = localita.nome;
        lat.input.value = String(localita.latitudine);
        lon.input.value = String(localita.longitudine);
      }
      mostra(imp.localita);

      // Ricerca per nome (geocoding di Open-Meteo).
      var cerca = campo('Cerca una città', { name: 'ricerca', type: 'search', maxlength: '80', enterkeyhint: 'search', placeholder: 'Es. Roma' });
      var risultati = ui.el('div', { class: 'localita-risultati', 'aria-live': 'polite' });
      var moduloRicerca = ui.el('form', { class: 'localita-ricerca', role: 'search', novalidate: true }, [
        cerca.nodo,
        ui.el('button', { type: 'submit', class: 'pulsante pulsante-primario', testo: 'Cerca' })
      ]);
      moduloRicerca.addEventListener('submit', CasaNostra.errori.protetta(function (ev) {
        ev.preventDefault();
        var testo = cerca.input.value.trim();
        if (!testo) { cerca.input.focus(); return; }
        ui.svuota(risultati).appendChild(ui.el('p', { class: 'vuoto', testo: 'Ricerca in corso…' }));
        return meteo.cercaLocalita(testo).then(function (trovati) {
          ui.svuota(risultati);
          if (!trovati.length) {
            risultati.appendChild(ui.el('p', { class: 'vuoto', testo: 'Nessuna località trovata per «' + testo + '».' }));
            return;
          }
          risultati.appendChild(ui.el('ul', { class: 'localita-elenco', 'aria-label': 'Località trovate' }, trovati.map(function (t) {
            return ui.el('li', {}, [ui.el('button', {
              type: 'button', class: 'pulsante pulsante-secondario localita-scelta', testo: t.descrizione,
              on: { click: CasaNostra.errori.protetta(function () {
                return salvaLocalita({ nome: t.nome, latitudine: t.latitudine, longitudine: t.longitudine }).then(function (l) {
                  mostra(l);
                  ui.svuota(risultati);
                  cerca.input.value = '';
                });
              }, 'scelta della località') }
            })]);
          })));
        }, function (err) {
          CasaNostra.errori.registra(err, 'ricerca della località');
          ui.svuota(risultati).appendChild(ui.messaggioErrore(err, 'Ricerca non riuscita.'));
        });
      }, 'ricerca della località'));

      // Coordinate a mano.
      var errore = ui.el('p', { class: 'messaggio-errore', role: 'alert', hidden: true });
      var moduloCoordinate = ui.el('form', { class: 'localita-coordinate', novalidate: true }, [
        nome.nodo, lat.nodo, lon.nodo, errore,
        ui.el('button', { type: 'submit', class: 'pulsante pulsante-primario', testo: 'Salva coordinate' })
      ]);
      moduloCoordinate.addEventListener('submit', CasaNostra.errori.protetta(function (ev) {
        ev.preventDefault();
        var messaggio = meteo.validaCoordinate(lat.input.value, lon.input.value);
        errore.hidden = !messaggio;
        errore.textContent = messaggio || '';
        if (messaggio) return;
        var la = meteo.leggiNumero(lat.input.value);
        var lo = meteo.leggiNumero(lon.input.value);
        var n = nome.input.value.trim() || (la + ', ' + lo);
        return salvaLocalita({ nome: n, latitudine: la, longitudine: lo }).then(mostra);
      }, 'salvataggio delle coordinate'));

      corpo.appendChild(attuale);
      corpo.appendChild(moduloRicerca);
      corpo.appendChild(risultati);
      corpo.appendChild(ui.el('p', { class: 'aiuto', testo: 'Oppure inserisci le coordinate a mano. Non usiamo mai il GPS.' }));
      corpo.appendChild(moduloCoordinate);
    });
  }

  ui.registraGruppoImpostazioni({ id: 'localita', titolo: 'Località del meteo', ordine: 20, disegna: disegnaLocalita });

  CasaNostra.sezioni.meteo = {};
})(window.CasaNostra);
