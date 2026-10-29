/*
 * Sezione Meteo — scheda Meteo della dashboard e gruppo "Località del meteo" nelle impostazioni.
 * Non ha una pagina propria e non espone nulla in CasaNostra.sezioni. La logica (richieste, copia, limiti)
 * sta in js/meteo.js.
 */
(function (CasaNostra) {
  'use strict';

  var ui = CasaNostra.ui;
  var meteo = CasaNostra.meteo;

  // Sotto questa probabilità di pioggia la casella oraria non mostra alcun dato di pioggia.
  var SOGLIA_PIOGGIA = 20;

  function gradi(x) { return Math.round(x) + '°'; }

  function soloLettori(testo) { return ui.el('span', { class: 'solo-lettori', testo: testo }); }

  /** Emoji a video, condizione a parole solo per i lettori di schermo. */
  function emojiCondizione(codice) {
    var c = meteo.condizione(codice);
    return [ui.el('span', { class: 'meteo-emoji', 'aria-hidden': 'true', testo: c.emoji }), soloLettori(c.testo)];
  }

  /** 'minima°/massima°'; i lettori di schermo sentono "da minima a massima". */
  function minimaMassima(classe, valori) {
    return ui.el('span', { class: classe }, [
      soloLettori('da '),
      ui.el('span', { class: 'meteo-minima', testo: gradi(valori.minima) }),
      ui.el('span', { 'aria-hidden': 'true', testo: '/' }),
      soloLettori(' a '),
      ui.el('span', { class: 'meteo-massima', testo: gradi(valori.massima) })
    ]);
  }

  function disegnaDati(contenitore, dati) {
    var a = dati.attuale;
    var cond = meteo.condizione(a.codice);
    contenitore.appendChild(ui.el('div', { class: 'meteo-attuale' }, [
      ui.el('span', { class: 'meteo-emoji', 'aria-hidden': 'true', testo: cond.emoji }),
      ui.el('span', { class: 'meteo-temperatura', testo: gradi(a.temperatura) }),
      ui.el('span', { class: 'meteo-oggi' }, [soloLettori('Oggi '), minimaMassima('meteo-oggi-temperature', a)])
    ]));
    contenitore.appendChild(ui.el('p', { class: 'meteo-condizione', testo: cond.testo }));
    contenitore.appendChild(ui.el('p', { class: 'meteo-dettagli', testo: 'Percepita ' + gradi(a.percepita) + ' · Vento ' + Math.round(a.vento) + ' km/h' }));
    contenitore.appendChild(ui.el('ul', { class: 'meteo-ore', 'aria-label': 'Previsione oraria' }, dati.ore.map(function (o) {
      var figli = [ui.el('span', { class: 'meteo-ora-orario', testo: o.ora })]
        .concat(emojiCondizione(o.codice))
        .concat([ui.el('span', { class: 'meteo-ora-temperatura', testo: gradi(o.temperatura) })]);
      if (typeof o.pioggia === 'number' && o.pioggia >= SOGLIA_PIOGGIA) {
        figli.push(ui.el('span', { class: 'meteo-pioggia' }, [
          ui.el('span', { class: 'meteo-pioggia-goccia', 'aria-hidden': 'true', testo: '💧 ' }),
          soloLettori('pioggia '),
          Math.round(o.pioggia) + '%'
        ]));
      }
      return ui.el('li', { class: 'meteo-ora' }, figli);
    })));
    contenitore.appendChild(ui.el('ul', { class: 'meteo-giorni', 'aria-label': 'Previsione giornaliera' }, dati.giorni.map(function (g) {
      return ui.el('li', { class: 'meteo-giorno' }, [ui.el('span', { class: 'meteo-giorno-data', testo: CasaNostra.date.formattaGiornoBreve(g.data) })]
        .concat(emojiCondizione(g.codice))
        .concat([minimaMassima('meteo-giorno-temperature', g)]));
    })));
  }

  /** 'agg. HH:MM' (ora locale del dispositivo); se la copia non è di oggi, anche il giorno: 'agg. GG/MM HH:MM'. */
  function testoAggiornato(ms) {
    var d = new Date(ms);
    var giorno = CasaNostra.date.oggi(d);
    var prefisso = giorno === CasaNostra.date.oggi() ? '' : CasaNostra.date.formattaGiornoMese(giorno) + ' ';
    return 'agg. ' + prefisso + CasaNostra.date.ora(d);
  }

  // ---------- scheda della dashboard ----------
  //
  // Nessun polling: un solo timer, puntato sul prossimo aggiornamento automatico (copia di 30 minuti),
  // attivo solo con la pagina visibile. Quando la pagina torna visibile si controlla subito.

  var MINIMO_TIMER_MS = 1000;
  var attiva = null; // { area, localita, copia, errore, inCorso, timer, sblocco }

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
    var localita = s.copia && s.copia.localita.nome ? s.copia.localita : s.localita;
    ui.svuota(s.fondo).appendChild(ui.el('span', { class: 'meteo-fondo-localita', testo: localita.nome }));
    // spazio non separabile: in un contenitore flex uno spazio normale all'inizio del pezzo sparirebbe
    if (s.copia) s.fondo.appendChild(ui.el('span', { class: 'meteo-fondo-orario', testo: '\u00a0· ' + testoAggiornato(s.copia.salvataIl) }));
    if (s.copia) {
      disegnaDati(area, s.copia.dati);
      if (s.errore) {
        area.appendChild(ui.el('p', { class: 'meteo-avviso', role: 'status' }, [
          ui.iconaAvviso(),
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
      if (attiva !== s) return;
      disegnaStato(s);
      pianifica(s);
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

  /** Punta il timer sul prossimo aggiornamento automatico; nessun timer a pagina nascosta o con una richiesta in corso. */
  function pianifica(s) {
    clearTimeout(s.timer);
    s.timer = null;
    if (attiva !== s || s.inCorso || !paginaVisibile()) return;
    var attesa = Math.max(MINIMO_TIMER_MS, meteo.attesaAutomatica(s.localita));
    s.timer = setTimeout(function () {
      s.timer = null;
      controlla(s, false);
      pianifica(s);
    }, attesa);
  }

  function alCambioVisibilita() {
    if (!attiva) return;
    controlla(attiva, false);
    pianifica(attiva);
  }

  function esciScheda() {
    if (!attiva) return;
    clearTimeout(attiva.timer);
    clearTimeout(attiva.sblocco);
    attiva = null;
    document.removeEventListener('visibilitychange', alCambioVisibilita);
  }

  function disegnaScheda(corpo) {
    esciScheda();
    var area = ui.el('div', { class: 'meteo-area', 'aria-live': 'polite' });
    var pulsante = ui.el('button', { type: 'button', class: 'pulsante pulsante-secondario meteo-aggiorna', testo: 'Aggiorna', disabled: true });
    var fondo = ui.el('p', { class: 'meteo-fondo-testo' });
    corpo.appendChild(area);
    corpo.appendChild(ui.el('div', { class: 'meteo-fondo' }, [fondo, pulsante]));
    return CasaNostra.impostazioni.leggi().then(function (imp) {
      var s = { area: area, fondo: fondo, pulsante: pulsante, localita: imp.localita, copia: meteo.copiaPer(imp.localita), errore: null, inCorso: null };
      pulsante.addEventListener('click', CasaNostra.errori.protetta(function () { return aggiornaAMano(s); }, 'aggiornamento del meteo'));
      attiva = s;
      disegnaStato(s);
      document.addEventListener('visibilitychange', alCambioVisibilita);
      controlla(s, true);
      pianifica(s);
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
})(window.CasaNostra);
