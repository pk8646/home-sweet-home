'use strict';
// Meteo e località (ticket #6): scheda Meteo della dashboard e gruppo "Località del meteo" nelle impostazioni.
// La rete verso Open-Meteo è sempre intercettata: nessuna richiesta reale.
const { test, assert, attendi, oraRoma } = require('../lib/test');

const PREVISIONI = 'https://api.open-meteo.com/v1/forecast**';
const GEOCODING = 'https://geocoding-api.open-meteo.com/v1/search**';

/** Risposta di Open-Meteo plausibile: oggi 28/10/2026 e i 5 giorni seguenti. */
function rispostaPrevisioni(variante) {
  const v = variante || {};
  return {
    latitude: 41.77, longitude: 12.23, timezone: 'Europe/Rome',
    current: {
      time: '2026-10-28T10:00',
      temperature_2m: v.temperatura !== undefined ? v.temperatura : 18.4,
      apparent_temperature: 16.6,
      relative_humidity_2m: 72,
      weather_code: v.codice !== undefined ? v.codice : 2,
      wind_speed_10m: 14.3
    },
    daily: {
      time: ['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'],
      weather_code: [2, 61, 0, 3, 95, 45],
      temperature_2m_max: [21.2, 19.6, 22.4, 20.1, 17.8, 18.3],
      temperature_2m_min: [12.1, 13.4, 11.2, 10.6, 12.9, 9.4]
    }
  };
}

/** Intercettazione delle previsioni che conta le richieste; `risposta` si può cambiare durante il test. */
function previsioniContate() {
  const p = { richieste: [], risposta: rispostaPrevisioni() };
  p.voce = {
    url: PREVISIONI,
    gestore: function (route) {
      p.richieste.push(route.request().url());
      return route.fulfill({
        status: 200, contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(p.risposta)
      }).catch(function () {});
    }
  };
  return p;
}

function schedaMeteo(page) { return page.getByRole('region', { name: 'Meteo' }); }
function gruppoLocalita(page) { return page.getByRole('region', { name: 'Località del meteo' }); }

test('con una risposta valida la scheda mostra i valori attuali e 5 giorni di previsione', async ({ apri }) => {
  const app = await apri({ rete: [{ url: PREVISIONI, json: rispostaPrevisioni() }] });
  const scheda = schedaMeteo(app.page);
  await attendi(async () => assert.match(await scheda.textContent(), /18°/));
  const testo = await scheda.textContent();
  assert.match(testo, /Fiumicino/);
  assert.match(testo, /Parzialmente nuvoloso/);
  assert.match(testo, /⛅/);
  assert.match(testo, /Percepita 17°/);
  assert.match(testo, /Umidità 72%/);
  assert.match(testo, /Vento 14 km\/h/);
  const giorni = scheda.getByRole('list', { name: 'Previsioni dei prossimi giorni' }).getByRole('listitem');
  assert.equal(await giorni.count(), 5);
  const primo = await giorni.first().textContent();
  assert.match(primo, /29\/10/);
  assert.match(primo, /Pioggia debole/);
  assert.match(primo, /13°/);
  assert.match(primo, /20°/);
  assert.match(await giorni.nth(3).textContent(), /Temporale/);
  assert.match(await giorni.last().textContent(), /02\/11/);
  assert.match(await giorni.last().textContent(), /Nebbia/);
  assert.deepEqual(app.richiesteEsterne, []);
});

const GUASTI = {
  'rete assente': { assente: true },
  'HTTP 500': { stato: 500, corpo: 'errore' },
  'JSON malformato': { corpo: '{"current": {', tipo: 'application/json' },
  'timeout': { gestore: function () { return new Promise(function () {}); } }
};

Object.keys(GUASTI).forEach(function (nome) {
  test('con ' + nome + ' e una copia presente compare la copia con l\'orario di aggiornamento', async ({ apri }) => {
    const app = await apri({ ora: '2026-10-28T09:05', rete: [{ url: PREVISIONI, json: rispostaPrevisioni() }] });
    await attendi(async () => assert.match(await schedaMeteo(app.page).textContent(), /18°/));
    await app.rete(PREVISIONI, GUASTI[nome]);
    await app.avanzaOra(31 * 60 * 1000);
    if (nome === 'timeout') await app.avanzaOra(10 * 1000 + 100);
    await attendi(async () => {
      const testo = await schedaMeteo(app.page).textContent();
      assert.match(testo, /Aggiornato alle 09:05 del 28\/10/);
      assert.match(testo, /Non è stato possibile aggiornare il meteo/);
    });
    assert.match(await schedaMeteo(app.page).textContent(), /18°/);
    assert.equal(await schedaMeteo(app.page).getByRole('list', { name: 'Previsioni dei prossimi giorni' }).getByRole('listitem').count(), 5);
  });
});

test('una nuova apertura entro 30 minuti non fa richieste, dopo 30 minuti sì', async ({ apri }) => {
  const previsioni = previsioniContate();
  const app = await apri({ ora: '2026-10-28T09:05', rete: [previsioni.voce] });
  await attendi(async () => assert.match(await schedaMeteo(app.page).textContent(), /18°/));
  assert.equal(previsioni.richieste.length, 1);
  await app.avanzaOra(20 * 60 * 1000);
  await app.ricarica();
  await app.vai('#/spesa');
  await app.vai('#/');
  assert.match(await schedaMeteo(app.page).textContent(), /Aggiornato alle 09:05 del 28\/10/);
  assert.equal(previsioni.richieste.length, 1);
  // L'ora salta avanti senza eseguire timer (es. tablet spento): conta solo l'età della copia all'apertura.
  await app.orologio.setSystemTime(oraRoma('2026-10-28T09:40'));
  await app.ricarica();
  await attendi(async () => assert.equal(previsioni.richieste.length, 2));
});

test('il pulsante Aggiorna non permette più di una richiesta al minuto', async ({ apri }) => {
  const previsioni = previsioniContate();
  const app = await apri({ ora: '2026-10-28T09:05', rete: [previsioni.voce] });
  const scheda = schedaMeteo(app.page);
  const pulsante = scheda.getByRole('button', { name: 'Aggiorna' });
  await attendi(async () => assert.equal(previsioni.richieste.length, 1));
  await attendi(async () => assert.equal(await pulsante.isDisabled(), true));
  await app.avanzaOra(61 * 1000);
  await attendi(async () => assert.equal(await pulsante.isDisabled(), false));
  previsioni.risposta = rispostaPrevisioni({ temperatura: 21 });
  await pulsante.click();
  await attendi(async () => assert.match(await scheda.textContent(), /21°/));
  assert.equal(previsioni.richieste.length, 2);
  assert.equal(await pulsante.isDisabled(), true);
  await app.avanzaOra(30 * 1000);
  assert.equal(await pulsante.isDisabled(), true);
  await app.ricarica(); // anche ricaricando la pagina il limite resta
  assert.equal(await schedaMeteo(app.page).getByRole('button', { name: 'Aggiorna' }).isDisabled(), true);
  assert.equal(previsioni.richieste.length, 2);
  await app.avanzaOra(31 * 1000);
  await attendi(async () => assert.equal(await schedaMeteo(app.page).getByRole('button', { name: 'Aggiorna' }).isDisabled(), false));
  assert.equal(previsioni.richieste.length, 2);
});

/** Simula la pagina nascosta o di nuovo visibile (es. tablet in standby). */
async function impostaVisibilita(page, stato) {
  await page.evaluate(function (s) {
    Object.defineProperty(document, 'visibilityState', { value: s, configurable: true });
    Object.defineProperty(document, 'hidden', { value: s === 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, stato);
}

test('con la pagina visibile si aggiorna ogni 30 minuti, con la pagina nascosta il timer non fa richieste', async ({ apri }) => {
  const previsioni = previsioniContate();
  const app = await apri({ ora: '2026-10-28T09:05', rete: [previsioni.voce] });
  await attendi(async () => assert.equal(previsioni.richieste.length, 1));
  // Prima che l'orologio finto corra, la risposta deve essere arrivata: i 30 minuti partono da lì.
  await attendi(async () => assert.match(await schedaMeteo(app.page).textContent(), /Aggiornato alle 09:05/));
  await app.avanzaOra(29 * 60 * 1000);
  assert.equal(previsioni.richieste.length, 1);
  // Poi a passi di un secondo: correre l'orologio finto di minuti in un colpo farebbe scadere anche il
  // timeout di 10 s della richiesta appena partita, prima che arrivi all'intercettazione.
  for (let s = 0; s < 120 && previsioni.richieste.length < 2; s++) await app.avanzaOra(1000);
  await attendi(async () => assert.equal(previsioni.richieste.length, 2));
  await impostaVisibilita(app.page, 'hidden');
  await app.avanzaOra(3 * 60 * 60 * 1000);
  assert.equal(previsioni.richieste.length, 2);
  await impostaVisibilita(app.page, 'visible');
  await attendi(async () => assert.equal(previsioni.richieste.length, 3));
});

const RISULTATI_ROMA = {
  results: [
    { id: 3169070, name: 'Roma', latitude: 41.89193, longitude: 12.51133, country: 'Italia', admin1: 'Lazio' },
    { id: 4219762, name: 'Rome', latitude: 34.25704, longitude: -85.16467, country: 'Stati Uniti', admin1: 'Georgia' }
  ]
};

test('la ricerca di "Roma" mostra risultati selezionabili; sceglierne uno salva nome e coordinate e aggiorna il meteo', async ({ apri }) => {
  const previsioni = previsioniContate();
  const app = await apri({ percorso: '#/impostazioni', rete: [previsioni.voce] });
  const ricerca = await app.rete(GEOCODING, { json: RISULTATI_ROMA });
  const gruppo = gruppoLocalita(app.page);
  assert.match(await gruppo.textContent(), /Fiumicino/);
  await gruppo.getByLabel('Cerca una città').fill('Roma');
  await gruppo.getByRole('button', { name: 'Cerca' }).click();
  const scelta = gruppo.getByRole('button', { name: /Roma, Lazio, Italia/ });
  await scelta.waitFor();
  assert.equal(await gruppo.getByRole('button', { name: /Rome, Georgia, Stati Uniti/ }).count(), 1);
  const url = new URL(ricerca.richieste[0]);
  assert.equal(url.searchParams.get('name'), 'Roma');
  assert.equal(url.searchParams.get('language'), 'it');

  previsioni.risposta = rispostaPrevisioni({ temperatura: 23 });
  await scelta.click();
  await attendi(async () => assert.match(await gruppo.textContent(), /Località attuale: Roma/));
  await attendi(async () => assert.ok(previsioni.richieste.some(function (u) {
    const q = new URL(u).searchParams;
    return q.get('latitude') === '41.89193' && q.get('longitude') === '12.51133';
  })));

  await app.ricarica();
  assert.match(await gruppoLocalita(app.page).textContent(), /Località attuale: Roma/);
  assert.equal(await gruppoLocalita(app.page).getByLabel('Latitudine').inputValue(), '41.89193');
  assert.equal(await gruppoLocalita(app.page).getByLabel('Longitudine').inputValue(), '12.51133');
  const prima = previsioni.richieste.length;
  await app.vai('#/');
  const scheda = schedaMeteo(app.page);
  await attendi(async () => assert.match(await scheda.textContent(), /Roma/));
  assert.match(await scheda.textContent(), /23°/);
  assert.equal(previsioni.richieste.length, prima); // la copia di Roma è fresca
  assert.deepEqual(app.richiesteEsterne, []);
});

test('una copia relativa a un\'altra località non viene mostrata come attuale', async ({ apri }) => {
  const app = await apri({ ora: '2026-10-28T09:05', rete: [{ url: PREVISIONI, json: rispostaPrevisioni() }] });
  await attendi(async () => assert.match(await schedaMeteo(app.page).textContent(), /18°/));
  await app.rete(PREVISIONI, { assente: true });
  await app.vai('#/impostazioni');
  const gruppo = gruppoLocalita(app.page);
  await gruppo.getByLabel('Nome della località').fill('Casa al mare');
  await gruppo.getByLabel('Latitudine').fill('40,85');
  await gruppo.getByLabel('Longitudine').fill('14.27');
  await gruppo.getByRole('button', { name: 'Salva coordinate' }).click();
  await attendi(async () => assert.match(await gruppo.textContent(), /Località attuale: Casa al mare/));
  await app.vai('#/');
  await attendi(async () => assert.match(await schedaMeteo(app.page).textContent(), /Meteo non disponibile/));
  const testo = await schedaMeteo(app.page).textContent();
  assert.doesNotMatch(testo, /18°/);
  assert.doesNotMatch(testo, /Fiumicino/);
});

test('le coordinate non valide vengono rifiutate con un messaggio', async ({ apri }) => {
  const app = await apri({ percorso: '#/impostazioni', rete: [{ url: PREVISIONI, json: rispostaPrevisioni() }] });
  const gruppo = gruppoLocalita(app.page);
  const salva = gruppo.getByRole('button', { name: 'Salva coordinate' });
  const casi = [
    ['95', '12', /latitudine deve essere un numero tra −90 e 90/],
    ['-90.5', '12', /latitudine/],
    ['41', '-181', /longitudine deve essere un numero tra −180 e 180/],
    ['41', '180.01', /longitudine/],
    ['abc', '12', /latitudine/],
    ['', '12', /latitudine/],
    ['41', '12,5,3', /longitudine/]
  ];
  for (const [la, lo, messaggio] of casi) {
    await gruppo.getByLabel('Latitudine').fill(la);
    await gruppo.getByLabel('Longitudine').fill(lo);
    await salva.click();
    await attendi(async () => assert.match(await gruppo.getByRole('alert').textContent(), messaggio));
  }
  await app.ricarica();
  assert.match(await gruppoLocalita(app.page).textContent(), /Località attuale: Fiumicino/);
  // I limiti sono validi.
  await gruppoLocalita(app.page).getByLabel('Latitudine').fill('-90');
  await gruppoLocalita(app.page).getByLabel('Longitudine').fill('180');
  await gruppoLocalita(app.page).getByRole('button', { name: 'Salva coordinate' }).click();
  await attendi(async () => assert.match(await gruppoLocalita(app.page).textContent(), /Località attuale: .*-90, 180/));
  assert.equal(await gruppoLocalita(app.page).getByRole('alert').count(), 0);
});

test('le richieste vanno solo a Open-Meteo in https con coordinate o testo cercato, e mai alla geolocalizzazione', async ({ apri }) => {
  const app = await apri({
    percorso: '#/impostazioni',
    scriptIniziale: function () {
      window.__geolocalizzazione = 0;
      const finta = {
        getCurrentPosition: function () { window.__geolocalizzazione++; },
        watchPosition: function () { window.__geolocalizzazione++; return 1; },
        clearWatch: function () {}
      };
      Object.defineProperty(navigator, 'geolocation', { value: finta, configurable: true });
      if (navigator.permissions) {
        const originale = navigator.permissions.query.bind(navigator.permissions);
        navigator.permissions.query = function (d) {
          if (d && d.name === 'geolocation') window.__geolocalizzazione++;
          return originale(d);
        };
      }
    }
  });
  const tutte = [];
  await app.contesto.route('**/*open-meteo.com/**', function (route) {
    const u = route.request().url();
    tutte.push({ url: u, metodo: route.request().method(), corpo: route.request().postData() });
    const json = u.includes('geocoding') ? RISULTATI_ROMA : rispostaPrevisioni();
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(json) });
  });
  const gruppo = gruppoLocalita(app.page);
  await gruppo.getByLabel('Cerca una città').fill('Roma');
  await gruppo.getByRole('button', { name: 'Cerca' }).click();
  await gruppo.getByRole('button', { name: /Roma, Lazio, Italia/ }).click();
  await attendi(async () => assert.ok(tutte.some(function (r) { return r.url.includes('/v1/forecast'); })));
  await app.vai('#/');
  await attendi(async () => assert.match(await schedaMeteo(app.page).textContent(), /Roma/));

  const PARAMETRI_TECNICI = ['current', 'daily', 'timezone', 'forecast_days', 'count', 'language', 'format'];
  for (const r of tutte) {
    const u = new URL(r.url);
    assert.equal(u.protocol, 'https:', r.url);
    assert.ok(['api.open-meteo.com', 'geocoding-api.open-meteo.com'].includes(u.hostname), r.url);
    assert.equal(r.metodo, 'GET');
    assert.equal(r.corpo, null);
    const datiUtente = [...u.searchParams.keys()].filter(function (k) { return !PARAMETRI_TECNICI.includes(k); }).sort();
    if (u.hostname.startsWith('geocoding')) {
      assert.deepEqual(datiUtente, ['name'], r.url);
      assert.equal(u.searchParams.get('name'), 'Roma');
    } else {
      assert.deepEqual(datiUtente, ['latitude', 'longitude'], r.url);
    }
    for (const k of PARAMETRI_TECNICI) {
      const v = u.searchParams.get(k);
      if (v !== null) assert.match(v, /^[a-z0-9_,]+$/, k + '=' + v);
    }
  }
  assert.deepEqual(app.richiesteEsterne, []);
  assert.equal(await app.page.evaluate(function () { return window.__geolocalizzazione; }), 0);
});

test('su smartphone scheda e impostazioni del meteo non escono dallo schermo', async ({ apri }) => {
  const app = await apri({ viewport: 'smartphone', rete: [{ url: PREVISIONI, json: rispostaPrevisioni({ codice: 96 }) }] });
  await attendi(async () => assert.match(await schedaMeteo(app.page).textContent(), /Temporale con grandine/));
  assert.equal(await app.overflowOrizzontale(), 0);
  await app.vai('#/impostazioni');
  await app.rete(GEOCODING, { json: RISULTATI_ROMA });
  await gruppoLocalita(app.page).getByLabel('Cerca una città').fill('Roma');
  await gruppoLocalita(app.page).getByRole('button', { name: 'Cerca' }).click();
  await gruppoLocalita(app.page).getByRole('button', { name: /Roma, Lazio, Italia/ }).waitFor();
  assert.equal(await app.overflowOrizzontale(), 0);
});

test('senza copia e senza rete compare un messaggio chiaro e le altre schede funzionano', async ({ apri }) => {
  const app = await apri({ rete: [{ url: PREVISIONI, assente: true }] });
  await attendi(async () => assert.match(await schedaMeteo(app.page).textContent(), /non è raggiungibile/));
  const spesa = app.page.getByRole('region', { name: 'Spesa' });
  await spesa.getByLabel('Prodotto da aggiungere').fill('Pane');
  await spesa.getByLabel('Prodotto da aggiungere').press('Enter');
  await attendi(async () => assert.match(await spesa.textContent(), /Pane/));
});
