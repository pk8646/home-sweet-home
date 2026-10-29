/*
 * CasaNostra.meteo — Meteo: richieste a Open-Meteo, copia in LocalStorage, limiti di frequenza, codici WMO.
 *
 *   CasaNostra.meteo.scarica(localita)    -> Promise<dati normalizzati> (timeout 10 s)
 *   CasaNostra.meteo.condizione(codice)   -> { testo, emoji } in italiano
 *
 * Alle richieste vanno solo le coordinate (previsioni) o il testo cercato (geocoding): mai altri dati.
 */
(function (CasaNostra) {
  'use strict';

  var URL_PREVISIONI = 'https://api.open-meteo.com/v1/forecast';
  var TIMEOUT_MS = 10000;
  var GIORNI_PREVISIONE = 3; // da domani
  var ORE_PREVISIONE = 6;
  var PASSO_ORE = 2;

  // Codici WMO usati da Open-Meteo.
  var CONDIZIONI = {
    0: ['Sereno', '☀️'],
    1: ['Prevalentemente sereno', '🌤️'],
    2: ['Parzialmente nuvoloso', '⛅'],
    3: ['Coperto', '☁️'],
    45: ['Nebbia', '🌫️'],
    48: ['Nebbia con brina', '🌫️'],
    51: ['Pioviggine debole', '🌦️'],
    53: ['Pioviggine moderata', '🌦️'],
    55: ['Pioviggine intensa', '🌧️'],
    56: ['Pioviggine gelata debole', '🌧️'],
    57: ['Pioviggine gelata intensa', '🌧️'],
    61: ['Pioggia debole', '🌦️'],
    63: ['Pioggia moderata', '🌧️'],
    65: ['Pioggia forte', '🌧️'],
    66: ['Pioggia gelata debole', '🌧️'],
    67: ['Pioggia gelata forte', '🌧️'],
    71: ['Neve debole', '🌨️'],
    73: ['Neve moderata', '🌨️'],
    75: ['Neve forte', '❄️'],
    77: ['Neve granulosa', '🌨️'],
    80: ['Rovesci deboli', '🌦️'],
    81: ['Rovesci moderati', '🌧️'],
    82: ['Rovesci violenti', '⛈️'],
    85: ['Rovesci di neve deboli', '🌨️'],
    86: ['Rovesci di neve forti', '❄️'],
    95: ['Temporale', '⛈️'],
    96: ['Temporale con grandine debole', '⛈️'],
    99: ['Temporale con grandine forte', '⛈️']
  };

  function condizione(codice) {
    var c = CONDIZIONI[codice];
    return c ? { testo: c[0], emoji: c[1] } : { testo: 'Condizioni non disponibili', emoji: '❔' };
  }

  function erroreRisposta() {
    return CasaNostra.errori.perUtente('Il servizio meteo ha risposto in modo inatteso.');
  }

  function numero(x) {
    if (typeof x !== 'number' || !isFinite(x)) throw erroreRisposta();
    return x;
  }

  /** Probabilità di pioggia: un numero, oppure null se Open-Meteo non la fornisce per quell'ora. */
  function probabilita(x) {
    return x === null || x === undefined ? null : numero(x);
  }

  /**
   * Le ORE_PREVISIONE voci orarie, una ogni PASSO_ORE ore, a partire dalla prima ora intera successiva all'ora
   * di `current.time` (non all'orologio del dispositivo). Si contano le posizioni nell'elenco orario, che è
   * consecutivo nel tempo reale: così anche nel giorno del cambio d'ora le caselle distano davvero 2 ore.
   */
  function oreDa(h, adesso) {
    if (!h || !Array.isArray(h.time)) throw erroreRisposta();
    var oraIntera = adesso.slice(0, 13) + ':00';
    var inizio = -1;
    for (var i = 0; i < h.time.length; i++) {
      if (typeof h.time[i] === 'string' && h.time[i] > oraIntera) { inizio = i; break; }
    }
    if (inizio < 0) throw erroreRisposta();
    var ore = [];
    for (var k = 0; k < ORE_PREVISIONE; k++) {
      var j = inizio + k * PASSO_ORE;
      var t = h.time[j];
      if (typeof t !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(t)) throw erroreRisposta();
      ore.push({
        ora: t.slice(11, 16),
        codice: numero(h.weather_code && h.weather_code[j]),
        temperatura: numero(h.temperature_2m && h.temperature_2m[j]),
        pioggia: probabilita(h.precipitation_probability && h.precipitation_probability[j])
      });
    }
    return ore;
  }

  /** Riduce la risposta di Open-Meteo ai soli valori mostrati; lancia se manca qualcosa. */
  function normalizza(r) {
    if (!r || typeof r !== 'object' || !r.current || !r.daily || !Array.isArray(r.daily.time)) throw erroreRisposta();
    var c = r.current;
    var d = r.daily;
    if (typeof c.time !== 'string') throw erroreRisposta();
    var oggi = c.time.slice(0, 10);
    var diOggi = null;
    var giorni = [];
    for (var i = 0; i < d.time.length && giorni.length < GIORNI_PREVISIONE; i++) {
      if (!CasaNostra.date.valida(d.time[i])) throw erroreRisposta();
      if (d.time[i] < oggi) continue;
      var giorno = {
        data: d.time[i],
        codice: numero(d.weather_code && d.weather_code[i]),
        minima: numero(d.temperature_2m_min && d.temperature_2m_min[i]),
        massima: numero(d.temperature_2m_max && d.temperature_2m_max[i])
      };
      if (d.time[i] === oggi) diOggi = giorno;
      else giorni.push(giorno);
    }
    if (!diOggi || giorni.length !== GIORNI_PREVISIONE) throw erroreRisposta();
    return {
      attuale: {
        temperatura: numero(c.temperature_2m),
        percepita: numero(c.apparent_temperature),
        vento: numero(c.wind_speed_10m),
        codice: numero(c.weather_code),
        minima: diOggi.minima,
        massima: diOggi.massima
      },
      ore: oreDa(r.hourly, c.time),
      giorni: giorni
    };
  }

  /** fetch con timeout; gli errori di rete diventano messaggi per l'utente. */
  function richiestaJson(url) {
    var controllo = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = null;
    var scaduta = new Promise(function (_, rifiuta) {
      timer = setTimeout(function () {
        if (controllo) controllo.abort();
        rifiuta(CasaNostra.errori.perUtente('Il servizio meteo non ha risposto in tempo.'));
      }, TIMEOUT_MS);
    });
    var richiesta = fetch(url, { signal: controllo ? controllo.signal : undefined, credentials: 'omit', referrerPolicy: 'no-referrer' })
      .catch(function (err) {
        throw CasaNostra.errori.perUtente('Il servizio meteo non è raggiungibile. Controlla la connessione.', err);
      })
      .then(function (risposta) {
        if (!risposta.ok) throw CasaNostra.errori.perUtente('Il servizio meteo non è disponibile al momento (errore ' + risposta.status + ').');
        return risposta.json().catch(function (err) { throw CasaNostra.errori.perUtente('Il servizio meteo ha risposto in modo inatteso.', err); });
      });
    return Promise.race([richiesta, scaduta]).then(function (v) {
      clearTimeout(timer);
      return v;
    }, function (err) {
      clearTimeout(timer);
      throw err;
    });
  }

  function urlPrevisioni(localita) {
    return URL_PREVISIONI +
      '?latitude=' + encodeURIComponent(localita.latitudine) +
      '&longitude=' + encodeURIComponent(localita.longitudine) +
      '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m' +
      '&hourly=weather_code,temperature_2m,precipitation_probability' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min' +
      // oggi + 3 giorni; i dati orari partono dalla mezzanotte di oggi, quindi coprono sempre le 12 ore seguenti
      '&timezone=auto&forecast_days=' + (GIORNI_PREVISIONE + 1);
  }

  function scarica(localita) {
    return richiestaJson(urlPrevisioni(localita)).then(normalizza);
  }

  // ---------- copia in LocalStorage (ADR-0001: è l'unico dato in LocalStorage, usa e getta) ----------
  //
  // Un solo record: { salvataIl: ms, localita, dati, ultimaRichiesta: ms }. L'orario dell'ultima richiesta
  // (per il limite del pulsante Aggiorna) sta in memoria e, se c'è già una copia, anche dentro il suo record,
  // così il limite sopravvive al ricaricamento della pagina.

  var CHIAVE_COPIA = CasaNostra.PREFISSO_LOCALSTORAGE + 'meteo.copia';
  var INTERVALLO_MS = 30 * 60 * 1000;
  var BLOCCO_MANUALE_MS = 60 * 1000;

  function leggiJson(chiave) {
    try {
      var testo = window.localStorage.getItem(chiave);
      return testo ? JSON.parse(testo) : null;
    } catch (e) {
      return null;
    }
  }

  function scriviJson(chiave, valore) {
    try {
      window.localStorage.setItem(chiave, JSON.stringify(valore));
    } catch (e) {
      CasaNostra.errori.registra(e, 'salvataggio della copia del meteo');
    }
  }

  function stessaLocalita(a, b) {
    return !!(a && b) && Math.abs(Number(a.latitudine) - Number(b.latitudine)) < 1e-6 &&
      Math.abs(Number(a.longitudine) - Number(b.longitudine)) < 1e-6;
  }

  /** L'ultima copia valida, solo se riguarda questa località: { salvataIl: ms, localita, dati } | null. */
  function copiaPer(localita) {
    var c = leggiJson(CHIAVE_COPIA);
    if (!c || typeof c.salvataIl !== 'number' || !stessaLocalita(c.localita, localita)) return null;
    try {
      normalizzaCopia(c.dati);
    } catch (e) {
      return null;
    }
    return c;
  }

  // Controlla che una copia letta da LocalStorage abbia la forma attesa. Una copia nel formato precedente
  // (senza ore né minima/massima di oggi) non è valida: si ignora e la scheda la riscarica, senza migrazione.
  function normalizzaCopia(dati) {
    if (!dati || !dati.attuale || !Array.isArray(dati.giorni) || dati.giorni.length !== GIORNI_PREVISIONE ||
      !Array.isArray(dati.ore) || dati.ore.length !== ORE_PREVISIONE) throw erroreRisposta();
    ['temperatura', 'percepita', 'vento', 'codice', 'minima', 'massima'].forEach(function (k) { numero(dati.attuale[k]); });
    dati.giorni.forEach(function (g) {
      if (!g || !CasaNostra.date.valida(g.data)) throw erroreRisposta();
      ['codice', 'minima', 'massima'].forEach(function (k) { numero(g[k]); });
    });
    dati.ore.forEach(function (o) {
      if (!o || !CasaNostra.date.oraValida(o.ora)) throw erroreRisposta();
      numero(o.codice);
      numero(o.temperatura);
      probabilita(o.pioggia);
    });
  }

  var ultimaRichiestaInMemoria = 0;

  function ultimaRichiesta() {
    var c = leggiJson(CHIAVE_COPIA);
    var salvata = c && typeof c.ultimaRichiesta === 'number' ? c.ultimaRichiesta : 0;
    return Math.max(ultimaRichiestaInMemoria, salvata);
  }

  /** Registra l'orario di una nuova richiesta: in memoria e nel record della copia, se esiste. */
  function segnaRichiesta(t) {
    ultimaRichiestaInMemoria = t;
    var c = leggiJson(CHIAVE_COPIA);
    if (c && typeof c === 'object') {
      c.ultimaRichiesta = t;
      scriviJson(CHIAVE_COPIA, c);
    }
  }

  /** ms mancanti prima che il pulsante Aggiorna possa fare una nuova richiesta (0 = subito). */
  function attesaManuale(adesso) {
    var t = adesso === undefined ? Date.now() : adesso;
    return Math.max(0, ultimaRichiesta() + BLOCCO_MANUALE_MS - t);
  }

  /**
   * true se un aggiornamento automatico è dovuto: copia assente o più vecchia di 30 minuti, e
   * l'ultima richiesta è abbastanza lontana (all'apertura basta 1 minuto, poi 30 minuti).
   */
  function aggiornamentoDovuto(localita, opzioni) {
    var o = opzioni || {};
    var adesso = o.adesso === undefined ? Date.now() : o.adesso;
    var copia = copiaPer(localita);
    if (copia && adesso - copia.salvataIl < INTERVALLO_MS) return false;
    var pausa = o.apertura ? BLOCCO_MANUALE_MS : INTERVALLO_MS;
    return adesso - ultimaRichiesta() >= pausa;
  }

  /**
   * ms che mancano al prossimo aggiornamento automatico (0 = già dovuto): quando la copia compie 30 minuti
   * e sono passati 30 minuti dall'ultima richiesta. Serve al timer della scheda, attivo solo a pagina visibile.
   */
  function attesaAutomatica(localita, adesso) {
    var t = adesso === undefined ? Date.now() : adesso;
    var copia = copiaPer(localita);
    var scadenza = Math.max(copia ? copia.salvataIl + INTERVALLO_MS : 0, ultimaRichiesta() + INTERVALLO_MS);
    return Math.max(0, scadenza - t);
  }

  var inCorsoOra = null;   // { localita, promessa }: una sola richiesta per volta
  var ultimoFallimento = null; // { localita, errore } dell'ultima richiesta fallita (solo in memoria)

  /**
   * Scarica il meteo per la località, salva la copia e risolve con la copia nuova.
   * Se è già in corso una richiesta per la stessa località, restituisce quella.
   */
  function aggiorna(localita) {
    if (inCorsoOra && stessaLocalita(inCorsoOra.localita, localita)) return inCorsoOra.promessa;
    var partita = Date.now();
    segnaRichiesta(partita);
    var richiesta = { nome: String(localita.nome || ''), latitudine: Number(localita.latitudine), longitudine: Number(localita.longitudine) };
    var voce = { localita: richiesta };
    voce.promessa = scarica(richiesta).then(function (dati) {
      var copia = { salvataIl: Date.now(), localita: richiesta, dati: dati, ultimaRichiesta: Math.max(partita, ultimaRichiestaInMemoria) };
      scriviJson(CHIAVE_COPIA, copia);
      ultimoFallimento = null;
      return copia;
    }, function (err) {
      ultimoFallimento = { localita: richiesta, errore: err };
      throw err;
    });
    voce.promessa.catch(function () {}).then(function () { if (inCorsoOra === voce) inCorsoOra = null; });
    inCorsoOra = voce;
    return voce.promessa;
  }

  /** true se c'è una richiesta in corso per questa località. */
  function inCorso(localita) { return !!(inCorsoOra && stessaLocalita(inCorsoOra.localita, localita)); }

  /** L'errore dell'ultima richiesta fallita per questa località, se l'ultima richiesta è fallita. */
  function ultimoErrore(localita) {
    return ultimoFallimento && stessaLocalita(ultimoFallimento.localita, localita) ? ultimoFallimento.errore : null;
  }

  // ---------- località ----------

  var URL_GEOCODING = 'https://geocoding-api.open-meteo.com/v1/search';

  /** Cerca le città per nome (solo il testo cercato va al servizio). Risolve con [{ nome, descrizione, latitudine, longitudine }]. */
  function cercaLocalita(testo) {
    var t = String(testo || '').trim();
    if (!t) return Promise.resolve([]);
    var url = URL_GEOCODING + '?name=' + encodeURIComponent(t) + '&count=8&language=it&format=json';
    return richiestaJson(url).then(function (r) {
      if (!r || typeof r !== 'object') throw erroreRisposta();
      var risultati = Array.isArray(r.results) ? r.results : [];
      return risultati.filter(function (x) {
        return x && typeof x.name === 'string' && validaCoordinate(x.latitude, x.longitude) === null;
      }).map(function (x) {
        var parti = [x.name, x.admin1, x.country].filter(function (p, i, tutte) {
          return typeof p === 'string' && p && tutte.indexOf(p) === i;
        });
        return { nome: x.name, descrizione: parti.join(', '), latitudine: x.latitude, longitudine: x.longitude };
      });
    });
  }

  /** Converte un testo come "41,77" in numero; NaN se non è un numero decimale. */
  function leggiNumero(x) {
    if (typeof x === 'number') return x;
    var t = String(x === undefined || x === null ? '' : x).trim().replace(',', '.');
    return /^[-+]?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
  }

  /** null se le coordinate sono valide, altrimenti il messaggio per l'utente. */
  function validaCoordinate(latitudine, longitudine) {
    var lat = leggiNumero(latitudine);
    var lon = leggiNumero(longitudine);
    if (!isFinite(lat) || lat < -90 || lat > 90) return 'La latitudine deve essere un numero tra −90 e 90 (es. 41.77).';
    if (!isFinite(lon) || lon < -180 || lon > 180) return 'La longitudine deve essere un numero tra −180 e 180 (es. 12.23).';
    return null;
  }

  CasaNostra.meteo = {
    cercaLocalita: cercaLocalita,
    leggiNumero: leggiNumero,
    validaCoordinate: validaCoordinate,
    INTERVALLO_MS: INTERVALLO_MS,
    BLOCCO_MANUALE_MS: BLOCCO_MANUALE_MS,
    condizione: condizione,
    normalizza: normalizza,
    scarica: scarica,
    copiaPer: copiaPer,
    attesaManuale: attesaManuale,
    attesaAutomatica: attesaAutomatica,
    aggiornamentoDovuto: aggiornamentoDovuto,
    aggiorna: aggiorna,
    inCorso: inCorso,
    ultimoErrore: ultimoErrore
  };
})(window.CasaNostra);
