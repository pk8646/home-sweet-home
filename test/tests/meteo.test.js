'use strict';
// Meteo e località (ticket #6, scheda compatta #16): scheda Meteo della dashboard e gruppo "Località del meteo"
// nelle impostazioni. La rete verso Open-Meteo è sempre intercettata: nessuna richiesta reale.
const { test, assert, attendi, oraRoma } = require('../lib/test');
const { rispostaMeteoFinta } = require('../lib/meteo-finto');

const PREVISIONI = 'https://api.open-meteo.com/v1/forecast**';
const GEOCODING = 'https://geocoding-api.open-meteo.com/v1/search**';
const CHIAVE_COPIA = 'casaNostra.meteo.copia';

/** Risposta di Open-Meteo plausibile (opzioni in lib/meteo-finto.js): oggi 28/10/2026 alle 10:00 e i 3 giorni seguenti. */
function rispostaPrevisioni(opzioni) { return rispostaMeteoFinta(opzioni); }

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

function oreDellaScheda(scheda) { return scheda.getByRole('list', { name: 'Previsione oraria' }).getByRole('listitem'); }
function giorniDellaScheda(scheda) { return scheda.getByRole('list', { name: 'Previsione giornaliera' }).getByRole('listitem'); }

/**
 * Ciò che si vede in ogni voce di un elenco: il testo visibile di ciascuna parte, separato da uno spazio
 * (le parti con dimensioni nulle, cioè solo per i lettori di schermo, non contano).
 */
function testiVisibili(voci) {
  return voci.evaluateAll(function (li) {
    function visibile(n) { const r = n.getBoundingClientRect(); return r.width > 1 && r.height > 1; }
    function testo(n) {
      return Array.prototype.map.call(n.childNodes, function (c) {
        if (c.nodeType === 3) return c.data;
        return visibile(c) ? testo(c) : '';
      }).join('');
    }
    return li.map(function (n) {
      return Array.prototype.filter.call(n.children, visibile).map(function (c) { return testo(c).trim(); }).join(' ');
    });
  });
}

test('la previsione oraria ha 6 caselle ogni 2 ore dalla prossima ora intera della risposta, con ora, emoji e temperatura', async ({ apri }) => {
  // l'orologio del dispositivo non conta: le ore partono da current.time della risposta (10:00)
  const risposta = rispostaPrevisioni({ ora: '2026-10-28T10:00', codiciOrari: { '2026-10-28T15:00': 3 } });
  const app = await apri({ ora: '2026-10-28T09:05', rete: [{ url: PREVISIONI, json: risposta }] });
  const scheda = schedaMeteo(app.page);
  await attendi(async () => assert.equal(await oreDellaScheda(scheda).count(), 6));
  assert.deepEqual(await testiVisibili(oreDellaScheda(scheda)),
    ['11:00 ☀️ 11°', '13:00 ☀️ 13°', '15:00 ☁️ 15°', '17:00 ☀️ 17°', '19:00 ☀️ 19°', '21:00 ☀️ 21°']);
  assert.deepEqual(app.richiesteEsterne, []);
});

test('alle 22:30 la previsione oraria continua dopo la mezzanotte', async ({ apri }) => {
  const risposta = rispostaPrevisioni({ ora: '2026-10-28T22:30' });
  const app = await apri({ ora: '2026-10-28T22:31', rete: [{ url: PREVISIONI, json: risposta }] });
  const scheda = schedaMeteo(app.page);
  await attendi(async () => assert.equal(await oreDellaScheda(scheda).count(), 6));
  assert.deepEqual(await testiVisibili(oreDellaScheda(scheda)),
    ['23:00 ☀️ 23°', '01:00 ☀️ 25°', '03:00 ☀️ 27°', '05:00 ☀️ 29°', '07:00 ☀️ 31°', '09:00 ☀️ 33°']);
});

test('la probabilità di pioggia compare solo dal 20% in su', async ({ apri }) => {
  const risposta = rispostaPrevisioni({
    ora: '2026-10-28T10:00',
    pioggia: { '2026-10-28T11:00': 19, '2026-10-28T13:00': 20, '2026-10-28T15:00': 40, '2026-10-28T17:00': 100, '2026-10-28T19:00': 5 }
  });
  const app = await apri({ ora: '2026-10-28T10:00', rete: [{ url: PREVISIONI, json: risposta }] });
  const scheda = schedaMeteo(app.page);
  await attendi(async () => assert.equal(await oreDellaScheda(scheda).count(), 6));
  assert.deepEqual(await testiVisibili(oreDellaScheda(scheda)), [
    '11:00 ☀️ 11°', '13:00 ☀️ 13° 💧 20%', '15:00 ☀️ 15° 💧 40%', '17:00 ☀️ 17° 💧 100%', '19:00 ☀️ 19°', '21:00 ☀️ 21°'
  ]);
  // nessun dato di pioggia, nemmeno per i lettori di schermo, sotto la soglia
  assert.doesNotMatch(await oreDellaScheda(scheda).first().textContent(), /%|pioggia/i);
});

test('la previsione giornaliera ha esattamente i 3 giorni da domani, con giorno, emoji e "minima°/massima°"', async ({ apri }) => {
  // la risposta ha anche ieri e più giorni del necessario: si mostrano solo i 3 da domani
  const risposta = rispostaPrevisioni({ ora: '2026-10-28T10:00', giorni: 6 });
  risposta.daily.time.unshift('2026-10-27');
  risposta.daily.weather_code.unshift(99);
  risposta.daily.temperature_2m_min.unshift(1);
  risposta.daily.temperature_2m_max.unshift(2);
  const app = await apri({ ora: '2026-10-28T10:00', rete: [{ url: PREVISIONI, json: risposta }] });
  const scheda = schedaMeteo(app.page);
  await attendi(async () => assert.equal(await giorniDellaScheda(scheda).count(), 3));
  assert.deepEqual(await testiVisibili(giorniDellaScheda(scheda)),
    ['gio 29/10 🌦️ 13°/20°', 'ven 30/10 ☀️ 11°/22°', 'sab 31/10 ☁️ 11°/20°']);
});

test('la situazione attuale mostra emoji, temperatura, minima e massima di oggi, condizione, percepita e vento', async ({ apri }) => {
  const app = await apri({ ora: '2026-10-28T10:00', rete: [{ url: PREVISIONI, json: rispostaPrevisioni() }] });
  const scheda = schedaMeteo(app.page);
  await attendi(async () => assert.equal(await oreDellaScheda(scheda).count(), 6));
  const attuale = await scheda.evaluate(function (s) {
    function visibile(n) { const r = n.getBoundingClientRect(); return r.width > 1 && r.height > 1; }
    return Array.prototype.filter.call(s.querySelectorAll('.meteo-attuale, .meteo-condizione, .meteo-dettagli'), visibile).map(function (n) {
      const copia = n.cloneNode(true);
      copia.querySelectorAll('.solo-lettori').forEach(function (x) { x.remove(); });
      return copia.textContent;
    });
  });
  assert.deepEqual(attuale, ['⛅18°12°/21°', 'Parzialmente nuvoloso', 'Percepita 17° · Vento 14 km/h']);
  assert.doesNotMatch(await scheda.textContent(), /Umidità/);
  assert.deepEqual(app.richiesteEsterne, []);
});

test('i lettori di schermo sentono la condizione di ogni ora e di ogni giorno, non le emoji', async ({ apri }) => {
  const risposta = rispostaPrevisioni({ ora: '2026-10-28T10:00', codiciOrari: { '2026-10-28T13:00': 61 }, pioggia: { '2026-10-28T13:00': 60 } });
  const app = await apri({ ora: '2026-10-28T10:00', rete: [{ url: PREVISIONI, json: risposta }] });
  const scheda = schedaMeteo(app.page);
  await attendi(async () => assert.equal(await oreDellaScheda(scheda).count(), 6));
  const ore = await scheda.getByRole('list', { name: 'Previsione oraria' }).ariaSnapshot();
  assert.match(ore, /listitem: 11:00 Sereno 11°/);
  assert.match(ore, /listitem: 13:00 Pioggia debole 13° pioggia 60%/);
  const giorni = await scheda.getByRole('list', { name: 'Previsione giornaliera' }).ariaSnapshot();
  assert.match(giorni, /listitem: gio 29\/10 Pioggia debole da 13° a 20°/);
  assert.match(giorni, /listitem: ven 30\/10 Sereno da 11° a 22°/);
  for (const testo of [ore, giorni]) assert.doesNotMatch(testo, /[☀️🌦️☁️💧]/u);
  assert.match(await scheda.ariaSnapshot(), /Oggi da 12° a 21°/);
});

/** Riquadri sullo schermo dei pezzi della riga di fondo. */
function rigaDiFondo(scheda) {
  return scheda.evaluate(function (s) {
    const testo = s.querySelector('.meteo-fondo-testo');
    const pulsante = Array.prototype.find.call(s.querySelectorAll('button'), function (b) { return b.textContent === 'Aggiorna'; });
    const r = function (n) { const b = n.getBoundingClientRect(); return { alto: b.top, basso: b.bottom }; };
    return { testo: testo.textContent, riquadroTesto: r(testo), riquadroPulsante: r(pulsante), ultimo: s.lastElementChild.contains(pulsante) };
  });
}

test('in fondo alla scheda, su una sola riga, ci sono località, orario dell\'aggiornamento e pulsante Aggiorna', async ({ apri }) => {
  const app = await apri({ ora: '2026-10-28T14:30', rete: [{ url: PREVISIONI, json: rispostaPrevisioni({ ora: '2026-10-28T14:30' }) }] });
  const scheda = schedaMeteo(app.page);
  await attendi(async () => assert.match(await scheda.textContent(), /agg\. 14:30/));
  const fondo = await rigaDiFondo(scheda);
  assert.equal(fondo.testo.replace(/ /g, ' '), 'Fiumicino · agg. 14:30');
  assert.ok(fondo.ultimo, 'il pulsante è nell\'ultima riga della scheda');
  // testo e pulsante si sovrappongono in verticale: stanno sulla stessa riga
  assert.ok(fondo.riquadroTesto.alto < fondo.riquadroPulsante.basso && fondo.riquadroPulsante.alto < fondo.riquadroTesto.basso, JSON.stringify(fondo));
});

test('una copia del giorno prima mostra anche la data dell\'aggiornamento', async ({ apri }) => {
  const app = await apri({ ora: '2026-10-28T23:50', rete: [{ url: PREVISIONI, json: rispostaPrevisioni({ ora: '2026-10-28T23:45' }) }] });
  const scheda = schedaMeteo(app.page);
  await attendi(async () => assert.match(await scheda.textContent(), /agg\. 23:50/));
  await app.rete(PREVISIONI, { assente: true });
  await app.avanzaOra(31 * 60 * 1000);
  await attendi(async () => assert.match(await scheda.textContent(), /Non è stato possibile aggiornare il meteo/));
  assert.match(await scheda.textContent(), /Fiumicino\s·\sagg\. 28\/10 23:50/);
});

test('una copia nel formato precedente provoca una nuova richiesta', async ({ apri }) => {
  const previsioni = previsioniContate();
  const app = await apri({ ora: '2026-10-28T09:05', rete: [previsioni.voce] });
  await attendi(async () => assert.equal(await oreDellaScheda(schedaMeteo(app.page)).count(), 6));
  assert.equal(previsioni.richieste.length, 1);
  // la copia diventa quella fresca della versione precedente: 5 giorni, umidità, niente ore né minima/massima di oggi
  await app.page.evaluate(function (chiave) {
    const c = JSON.parse(localStorage.getItem(chiave));
    c.dati = {
      attuale: { temperatura: 9, percepita: 8, umidita: 72, vento: 10, codice: 3 },
      giorni: ['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'].map(function (d) { return { data: d, codice: 3, minima: 5, massima: 9 }; })
    };
    c.ultimaRichiesta = 0;
    localStorage.setItem(chiave, JSON.stringify(c));
  }, CHIAVE_COPIA);
  await app.avanzaOra(2 * 60 * 1000);
  await app.ricarica();
  await attendi(async () => assert.equal(previsioni.richieste.length, 2));
  await attendi(async () => assert.equal(await oreDellaScheda(schedaMeteo(app.page)).count(), 6));
  assert.match(await schedaMeteo(app.page).textContent(), /18°/);
});

test('una copia nel formato precedente, senza rete, mostra "Meteo non disponibile"', async ({ apri }) => {
  const app = await apri({
    ora: '2026-10-28T09:05',
    rete: [{ url: PREVISIONI, assente: true }],
    scriptIniziale: function () {
      // copia lasciata dalla versione precedente dell'app, ancora fresca
      localStorage.setItem('casaNostra.meteo.copia', JSON.stringify({
        salvataIl: Date.now(), ultimaRichiesta: 0,
        localita: { nome: 'Fiumicino', latitudine: 41.77, longitudine: 12.23 },
        dati: {
          attuale: { temperatura: 9, percepita: 8, umidita: 72, vento: 10, codice: 3 },
          giorni: ['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'].map(function (d) { return { data: d, codice: 3, minima: 5, massima: 9 }; })
        }
      }));
    }
  });
  const scheda = schedaMeteo(app.page);
  await attendi(async () => assert.match(await scheda.textContent(), /Meteo non disponibile/));
  assert.doesNotMatch(await scheda.textContent(), /9°|Coperto/);
});

test('una risposta senza dati orari è una risposta inattesa', async ({ apri }) => {
  const app = await apri({ ora: '2026-10-28T10:00', rete: [{ url: PREVISIONI, json: rispostaPrevisioni({ senzaOrari: true }) }] });
  const scheda = schedaMeteo(app.page);
  await attendi(async () => assert.match(await scheda.textContent(), /Il servizio meteo ha risposto in modo inatteso/));
  assert.match(await scheda.textContent(), /Meteo non disponibile/);
  assert.equal(await scheda.getByRole('list').count(), 0);
});

for (const [caso, guasta] of [
  ['senza probabilità di pioggia', function (r) { delete r.hourly.precipitation_probability; }],
  ['con la probabilità di pioggia non in elenco', function (r) { r.hourly.precipitation_probability = 40; }],
  ['con la probabilità di pioggia più corta delle ore', function (r) { r.hourly.precipitation_probability = r.hourly.precipitation_probability.slice(0, 12); }]
]) {
  test('una risposta ' + caso + ' è una risposta inattesa', async ({ apri }) => {
    const risposta = rispostaMeteoFinta({ ora: '2026-10-28T10:00' });
    guasta(risposta);
    const app = await apri({ ora: '2026-10-28T10:00', rete: [{ url: PREVISIONI, json: risposta }] });
    const scheda = schedaMeteo(app.page);
    await attendi(async () => assert.match(await scheda.textContent(), /Il servizio meteo ha risposto in modo inatteso/));
    assert.equal(await scheda.getByRole('list').count(), 0);
  });
}

test('un\'ora senza probabilità di pioggia (null) non mostra alcun dato di pioggia', async ({ apri }) => {
  const risposta = rispostaMeteoFinta({ ora: '2026-10-28T10:00', pioggia: { '2026-10-28T11:00': null, '2026-10-28T13:00': 40 } });
  const app = await apri({ ora: '2026-10-28T10:00', rete: [{ url: PREVISIONI, json: risposta }] });
  const scheda = schedaMeteo(app.page);
  await attendi(async () => assert.equal(await oreDellaScheda(scheda).count(), 6));
  assert.deepEqual((await testiVisibili(oreDellaScheda(scheda))).slice(0, 2), ['11:00 ☀️ 11°', '13:00 ☀️ 13° 💧 40%']);
});

test('una risposta con meno di 3 giorni da domani o con ore insufficienti è una risposta inattesa', async ({ apri }) => {
  const corta = rispostaPrevisioni({ ora: '2026-10-28T10:00', giorni: 3 });
  const app = await apri({ ora: '2026-10-28T10:00', rete: [{ url: PREVISIONI, json: corta }] });
  const scheda = schedaMeteo(app.page);
  await attendi(async () => assert.match(await scheda.textContent(), /risposto in modo inatteso/));
  // 4 giorni ma i dati orari finiscono prima delle 12 ore seguenti
  const senzaOre = rispostaPrevisioni({ ora: '2026-10-28T22:30' });
  for (const k of Object.keys(senzaOre.hourly)) senzaOre.hourly[k] = senzaOre.hourly[k].slice(0, 30);
  await app.rete(PREVISIONI, { json: senzaOre });
  await app.avanzaOra(61 * 1000);
  await scheda.getByRole('button', { name: 'Aggiorna' }).click();
  await app.avanzaOra(100);
  await attendi(async () => assert.match(await scheda.textContent(), /risposto in modo inatteso/));
  assert.equal(await scheda.getByRole('list').count(), 0);
});

/** Righe a capo e testi tagliati nella scheda: ogni testo visibile deve stare su una riga, per intero. */
function testiSpezzati(scheda) {
  return scheda.evaluate(function (s) {
    const problemi = [];
    const giro = document.createTreeWalker(s, NodeFilter.SHOW_TEXT);
    for (let n = giro.nextNode(); n; n = giro.nextNode()) {
      if (!n.data.trim() || n.parentElement.closest('.solo-lettori')) continue;
      const r = document.createRange();
      r.selectNodeContents(n);
      const cime = [];
      Array.prototype.forEach.call(r.getClientRects(), function (q) {
        if (q.width > 0 && !cime.some(function (c) { return Math.abs(c - q.top) < 2; })) cime.push(q.top);
      });
      if (cime.length > 1) problemi.push('"' + n.data + '" su ' + cime.length + ' righe');
    }
    s.querySelectorAll('*').forEach(function (e) {
      if (e.closest('.solo-lettori') || !e.getClientRects().length) return;
      if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'visible') {
        problemi.push('"' + e.textContent + '" tagliato (' + e.scrollWidth + ' > ' + e.clientWidth + ')');
      }
    });
    // ogni casella oraria e giornaliera contiene per intero il suo testo
    s.querySelectorAll('.meteo-ora, .meteo-giorno').forEach(function (li) {
      const b = li.getBoundingClientRect();
      Array.prototype.forEach.call(li.children, function (c) {
        if (c.classList.contains('solo-lettori')) return;
        const q = c.getBoundingClientRect();
        if (q.left < b.left - 1 || q.right > b.right + 1) problemi.push('"' + c.textContent + '" esce dalla sua casella');
      });
    });
    return problemi;
  });
}

/** Il caso più largo: condizione più lunga, temperature negative a due cifre, pioggia al 100% in ogni ora. */
function rispostaLarga() {
  const r = rispostaPrevisioni({ ora: '2026-10-28T22:30', codice: 96, temperatura: -15.4, codiciGiornalieri: [99, 96, 99, 86], minime: [-18, -18, -18, -18], massime: [-12, -12, -12, -12] });
  r.hourly.temperature_2m = r.hourly.temperature_2m.map(function () { return -15.4; });
  r.hourly.precipitation_probability = r.hourly.precipitation_probability.map(function () { return 100; });
  r.hourly.weather_code = r.hourly.weather_code.map(function () { return 99; });
  return r;
}

const CASI_LARGHEZZA = { 'con dati tipici': rispostaPrevisioni, 'con i testi più larghi': rispostaLarga };

for (const viewport of ['tabletOrizzontale', 'tabletVerticale', 'smartphone', 'desktop']) {
  for (const caso of Object.keys(CASI_LARGHEZZA)) {
    test('su ' + viewport + ', ' + caso + ', nessun testo della scheda Meteo va a capo o resta tagliato', async ({ apri }) => {
      const app = await apri({ viewport: viewport, ora: '2026-10-28T22:31', rete: [{ url: PREVISIONI, json: CASI_LARGHEZZA[caso]() }] });
      const scheda = schedaMeteo(app.page);
      await attendi(async () => assert.equal(await oreDellaScheda(scheda).count(), 6));
      assert.deepEqual(await testiSpezzati(scheda), []);
      assert.equal(await app.overflowOrizzontale(), 0);
    });
  }
}

/** Al primo avvio scrive nel database 3 appuntamenti e 3 attività, come in una settimana normale (agisce dall'esterno, come lib/benvenuto.js). */
function settimanaNormale() {
  const apriOriginale = IDBFactory.prototype.open;
  IDBFactory.prototype.open = function () {
    const richiesta = apriOriginale.apply(this, arguments);
    let creato = false;
    richiesta.addEventListener('upgradeneeded', function (ev) { if (ev.oldVersion === 0) creato = true; });
    richiesta.addEventListener('success', function () {
      if (!creato) return;
      creato = false;
      const tx = richiesta.result.transaction(['impostazioni', 'appuntamenti', 'attivita'], 'readwrite');
      tx.objectStore('impostazioni').put({ id: 'impostazioni', benvenutoVisto: true, ultimoBackup: '2026-10-27T10:00:00.000Z' });
      [['Dentista', '2026-10-28', '15:30'], ['Calcetto di Luca', '2026-10-29', '18:00'], ['Cena dai nonni', '2026-10-31', '20:00']].forEach(function (a, i) {
        tx.objectStore('appuntamenti').put({ id: 'a' + i, titolo: a[0], data: a[1], ora: a[2], note: '', creatoIl: '2026-10-01T08:00:00.000Z' });
      });
      ['Chiamare l\'idraulico', 'Pagare la mensa', 'Comprare il regalo'].forEach(function (t, i) {
        tx.objectStore('attivita').put({ id: 't' + i, titolo: t, nota: '', completata: false, creataIl: '2026-10-01T08:00:00.000Z', completataIl: null });
      });
    });
    return richiesta;
  };
}

test('a 1024×600 la scheda Meteo non è più alta della scheda più alta della sua riga', async ({ apri }) => {
  const risposta = rispostaPrevisioni({ ora: '2026-10-28T10:00', pioggia: { '2026-10-28T13:00': 60 } });
  const app = await apri({ viewport: 'tabletOrizzontale', ora: '2026-10-28T10:00', rete: [{ url: PREVISIONI, json: risposta }], scriptIniziale: settimanaNormale });
  await attendi(async () => assert.equal(await oreDellaScheda(schedaMeteo(app.page)).count(), 6));
  await attendi(async () => assert.match(await app.page.getByRole('region', { name: 'Agenda' }).textContent(), /Cena dai nonni/));
  const riga = await app.page.evaluate(function () {
    const schede = Array.prototype.map.call(document.querySelectorAll('.scheda'), function (s) {
      const b = s.getBoundingClientRect();
      return { nome: s.textContent.slice(0, 12), meteo: !!s.querySelector('.meteo-area'), alto: Math.round(b.top), altezza: Math.round(b.height) };
    });
    const meteo = schede.find(function (s) { return s.meteo; });
    return { meteo: meteo, altre: schede.filter(function (s) { return !s.meteo && s.alto === meteo.alto; }) };
  });
  assert.ok(riga.altre.length >= 2, 'la scheda Meteo divide la riga con altre schede: ' + JSON.stringify(riga));
  const piuAlta = Math.max.apply(null, riga.altre.map((s) => s.altezza));
  assert.ok(riga.meteo.altezza <= piuAlta, 'Meteo alta ' + riga.meteo.altezza + ' px, la più alta delle altre ' + piuAlta + ' px: ' + JSON.stringify(riga));
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
      assert.match(testo, /Fiumicino\s·\sagg\. 09:05/);
      assert.match(testo, /Non è stato possibile aggiornare il meteo/);
    });
    assert.match(await schedaMeteo(app.page).textContent(), /18°/);
    assert.equal(await schedaMeteo(app.page).getByRole('list', { name: 'Previsione giornaliera' }).getByRole('listitem').count(), 3);
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
  assert.match(await schedaMeteo(app.page).textContent(), /agg\. 09:05/);
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
  await attendi(async () => assert.match(await schedaMeteo(app.page).textContent(), /agg. 09:05/));
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

  const PARAMETRI_TECNICI = ['current', 'hourly', 'daily', 'timezone', 'forecast_days', 'count', 'language', 'format'];
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
