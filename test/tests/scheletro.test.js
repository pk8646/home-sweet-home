'use strict';
// Fondamenta dell'app (ticket #2): navigazione, orologio, errori, persistenza, dialoghi, layout.
const { test, assert, attendi } = require('../lib/test');

function titoloPagina(page) { return page.locator('main h2').first(); }

test('la dashboard si apre sotto /home-sweet-home/ con la barra di navigazione', async ({ apri }) => {
  const app = await apri();
  assert.match(await app.page.title(), /Casa Nostra/);
  const nav = app.page.getByRole('navigation', { name: 'Sezioni' });
  for (const voce of ['Home', 'Spesa', 'Agenda', 'Attività', 'Casa', 'Foto', 'Impostazioni']) {
    assert.equal(await nav.getByRole('link', { name: voce }).count(), 1, 'voce di navigazione ' + voce);
  }
});

test('la navigazione via hash funziona e "indietro" torna alla sezione precedente', async ({ apri }) => {
  const app = await apri();
  const nav = app.page.getByRole('navigation', { name: 'Sezioni' });
  await nav.getByRole('link', { name: 'Spesa' }).click();
  await app.attendiPronta();
  assert.match(app.page.url(), /\/home-sweet-home\/#\/spesa$/);
  assert.match(await titoloPagina(app.page).textContent(), /Spesa/);
  assert.equal(await nav.getByRole('link', { name: 'Spesa' }).getAttribute('aria-current'), 'page');

  await nav.getByRole('link', { name: 'Agenda' }).click();
  await app.attendiPronta();
  assert.match(await titoloPagina(app.page).textContent(), /Agenda/);

  await app.indietro();
  assert.match(app.page.url(), /#\/spesa$/);
  assert.match(await titoloPagina(app.page).textContent(), /Spesa/);
  await app.indietro();
  await app.page.getByRole('region', { name: 'Spesa' }).waitFor();
  assert.equal(await nav.getByRole('link', { name: 'Home' }).getAttribute('aria-current'), 'page');
});

test('un indirizzo sconosciuto mostra una pagina non trovata con il ritorno alla Home', async ({ apri }) => {
  const app = await apri({ percorso: '#/non-esiste' });
  assert.match(await titoloPagina(app.page).textContent(), /non trovata/i);
  await app.page.getByRole('main').getByRole('link', { name: 'Torna alla Home' }).click();
  await app.page.getByRole('region', { name: 'Spesa' }).waitFor();
});

test('data e ora sono visibili e si aggiornano; al cambio di giorno si ridisegnano le schede legate alla data', async ({ apri }) => {
  const app = await apri({ ora: '2026-10-28T23:58:30' });
  const intestazione = app.page.getByRole('banner');
  assert.match(await intestazione.textContent(), /23:58/);
  assert.match(await intestazione.textContent(), /Mercoledì 28 ottobre 2026/);

  // scheda di prova che mostra la data del proprio contesto
  await app.page.evaluate(() => {
    CasaNostra.ui.registraScheda({
      id: 'prova-data', titolo: 'Prova data', ordine: 1, dipendeDallaData: true,
      disegna: (corpo, contesto) => { corpo.appendChild(CasaNostra.ui.el('p', { testo: 'Oggi è ' + contesto.oggi })); }
    });
    return CasaNostra.ui.ridisegna();
  });
  const scheda = app.page.getByRole('region', { name: 'Prova data' });
  assert.match(await scheda.textContent(), /Oggi è 2026-10-28/);

  await app.avanzaOra(60000);
  await attendi(async () => assert.match(await intestazione.textContent(), /23:59/));
  assert.match(await scheda.textContent(), /Oggi è 2026-10-28/);
  await app.avanzaOra(60000);
  await attendi(async () => assert.match(await intestazione.textContent(), /00:00/));
  assert.match(await intestazione.textContent(), /Giovedì 29 ottobre 2026/);
  await attendi(async () => assert.match(await scheda.textContent(), /Oggi è 2026-10-29/));
});

test('un errore nel disegno di una scheda resta dentro la scheda e le altre funzionano', async ({ apri }) => {
  const app = await apri();
  await app.page.evaluate(() => {
    CasaNostra.ui.registraScheda({ id: 'guasta', titolo: 'Guasta', ordine: 1, disegna: () => { throw new Error('guasto simulato'); } });
    CasaNostra.ui.registraScheda({ id: 'lenta-guasta', titolo: 'Lenta guasta', ordine: 2, disegna: () => Promise.reject(new Error('guasto asincrono')) });
    return CasaNostra.ui.ridisegna();
  });
  for (const nome of ['Guasta', 'Lenta guasta']) {
    const scheda = app.page.getByRole('region', { name: nome, exact: true });
    await attendi(async () => assert.match(await scheda.getByRole('alert').textContent(), /Non è stato possibile mostrare questa scheda/));
  }
  const spesa = app.page.getByRole('region', { name: 'Spesa' });
  await spesa.getByLabel('Prodotto da aggiungere').fill('Zucchero');
  await spesa.getByRole('button', { name: 'Aggiungi' }).click();
  await spesa.getByRole('checkbox', { name: 'Zucchero' }).waitFor();
});

test('gli errori non gestiti diventano un toast comprensibile in italiano', async ({ apri }) => {
  const app = await apri({ consentiErrori: [/boom/] });
  await app.page.evaluate(() => { setTimeout(() => { throw new Error('boom'); }, 0); });
  await attendi(async () => assert.match(await app.page.locator('#toast-area').getByRole('alert').textContent(), /errore imprevisto/));
  await app.page.locator('#toast-area').getByRole('button', { name: 'Chiudi notifica' }).click();
  await app.page.evaluate(() => { Promise.reject(new Error('boom asincrono')); });
  await attendi(async () => assert.match(await app.page.locator('#toast-area').getByRole('alert').textContent(), /errore imprevisto/));
});

test('con IndexedDB non disponibile l\'app mostra un messaggio chiaro invece di bloccarsi', async ({ apri }) => {
  const app = await apri({ senzaIndexedDB: true });
  const avviso = app.page.locator('#avvisi-globali').getByRole('alert');
  assert.match(await avviso.textContent(), /non permette di salvare i dati \(IndexedDB non disponibile\)/);
  const spesa = app.page.getByRole('region', { name: 'Spesa' });
  await attendi(async () => assert.match(await spesa.getByRole('alert').textContent(), /IndexedDB non disponibile/));
  // la navigazione resta utilizzabile
  await app.page.getByRole('navigation', { name: 'Sezioni' }).getByRole('link', { name: 'Spesa' }).click();
  await app.attendiPronta();
  assert.match(await app.page.getByRole('main').getByRole('alert').textContent(), /IndexedDB non disponibile/);
});

test('i dialoghi dell\'app gestiscono il focus, la validazione ed Esc', async ({ apri }) => {
  const app = await apri();
  await app.page.evaluate(() => {
    const b = CasaNostra.ui.el('button', { type: 'button', id: 'apri-prova', testo: 'Apri prova' });
    document.getElementById('contenuto').appendChild(b);
    b.addEventListener('click', () => {
      window.__esito = 'in attesa';
      CasaNostra.dialoghi.modulo({
        titolo: 'Modifica prova',
        campi: [{ nome: 'titolo', etichetta: 'Titolo', obbligatorio: true, valore: '' }, { nome: 'note', etichetta: 'Note', tipo: 'textarea' }]
      }).then((v) => { window.__esito = v; });
    });
  });
  const apriProva = app.page.getByRole('button', { name: 'Apri prova' });
  await apriProva.click();
  const dialogo = app.page.getByRole('dialog', { name: 'Modifica prova' });
  await dialogo.waitFor();
  assert.equal(await app.page.evaluate(() => document.activeElement.labels[0].textContent), 'Titolo');
  await dialogo.getByRole('button', { name: 'Salva' }).click();
  assert.match(await dialogo.getByRole('alert').textContent(), /obbligatorio/);
  await dialogo.getByLabel('Titolo').fill('  Ciao  ');
  await dialogo.getByRole('button', { name: 'Salva' }).click();
  await attendi(async () => assert.deepEqual(await app.page.evaluate(() => window.__esito), { titolo: 'Ciao', note: '' }));
  assert.equal(await app.page.evaluate(() => document.activeElement.id), 'apri-prova');

  await apriProva.click();
  await dialogo.waitFor();
  await app.page.keyboard.press('Escape');
  await attendi(async () => assert.equal(await app.page.evaluate(() => window.__esito), null));
  assert.equal(await app.page.getByRole('dialog').count(), 0);
  assert.equal(await app.page.evaluate(() => document.activeElement.id), 'apri-prova');
});

test('la conferma con testo da digitare si abilita solo scrivendo la parola richiesta', async ({ apri }) => {
  const app = await apri();
  await app.page.evaluate(() => {
    CasaNostra.dialoghi.conferma({ titolo: 'Ripristino', richiediTesto: 'CANCELLA', testoConferma: 'Cancella tutto', pericolo: true })
      .then((v) => { window.__esito = v; });
  });
  const dialogo = app.page.getByRole('dialog', { name: 'Ripristino' });
  const conferma = dialogo.getByRole('button', { name: 'Cancella tutto' });
  assert.equal(await conferma.isDisabled(), true);
  await dialogo.getByLabel('Per confermare scrivi CANCELLA').fill('cancella');
  assert.equal(await conferma.isDisabled(), true);
  await dialogo.getByLabel('Per confermare scrivi CANCELLA').fill('CANCELLA');
  await conferma.click();
  await attendi(async () => assert.equal(await app.page.evaluate(() => window.__esito), true));
});

// ---------- layout ----------

async function registraSchedeFinte(app) {
  await app.page.evaluate(() => {
    ['Prima', 'Seconda', 'Terza'].forEach((t, i) => CasaNostra.ui.registraScheda({
      id: 'finta-' + i, titolo: t, ordine: 100 + i,
      disegna: (corpo) => { corpo.appendChild(CasaNostra.ui.el('p', { testo: 'Contenuto ' + t })); }
    }));
    return CasaNostra.ui.ridisegna();
  });
}

async function misure(app) {
  return app.page.evaluate(() => {
    const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
    const schede = Array.from(document.querySelectorAll('[data-scheda]')).map((n) => { const b = n.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y) }; });
    const piccoli = Array.from(document.querySelectorAll('nav a, main button, main input, main a, header button'))
      .filter((n) => n.offsetParent !== null && n.type !== 'checkbox')
      .map((n) => { const b = n.getBoundingClientRect(); return { testo: n.textContent || n.getAttribute('aria-label') || n.type, w: b.width, h: b.height }; })
      .filter((m) => m.h < 48 || (m.w < 48));
    return {
      nav: r('nav'), finestra: { w: innerWidth, h: innerHeight }, schede: schede, piccoli: piccoli,
      font: parseFloat(getComputedStyle(document.body).fontSize),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });
}

function controlliComuni(m) {
  assert.ok(m.overflow <= 0, 'nessuno scorrimento orizzontale (overflow ' + m.overflow + ')');
  assert.ok(m.font >= 18, 'testo base ≥ 18 px (' + m.font + ')');
  assert.deepEqual(m.piccoli, [], 'aree toccabili ≥ 48 px');
}

async function ultimoPulsanteRaggiungibile(app) {
  await app.vai('#/spesa');
  const b = app.page.getByRole('button', { name: 'Svuota tutto' });
  await b.scrollIntoViewIfNeeded();
  const coperto = await b.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const sopra = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !(sopra === el || el.contains(sopra));
  });
  assert.equal(coperto, false, 'l\'ultimo pulsante della pagina non è coperto dalla barra di navigazione');
}

test('layout tablet orizzontale 1024×600: navigazione laterale, dashboard su più colonne', async ({ apri }) => {
  const app = await apri({ viewport: 'tabletOrizzontale' });
  await registraSchedeFinte(app);
  const m = await misure(app);
  controlliComuni(m);
  assert.ok(m.nav.x < 5 && m.nav.h > m.nav.w, 'navigazione laterale a sinistra');
  assert.ok(new Set(m.schede.map((s) => s.x)).size >= 2, 'schede su più colonne');
  await ultimoPulsanteRaggiungibile(app);
});

test('layout tablet verticale 600×1024: navigazione in basso, dashboard su una colonna', async ({ apri }) => {
  const app = await apri({ viewport: 'tabletVerticale' });
  await registraSchedeFinte(app);
  const m = await misure(app);
  controlliComuni(m);
  assert.ok(Math.abs(m.nav.y + m.nav.h - m.finestra.h) < 2 && m.nav.w >= m.finestra.w - 2, 'navigazione in basso a tutta larghezza');
  assert.equal(new Set(m.schede.map((s) => s.x)).size, 1, 'una sola colonna');
  await ultimoPulsanteRaggiungibile(app);
});

test('layout smartphone: navigazione in basso, una colonna, nessuno scorrimento orizzontale', async ({ apri }) => {
  const app = await apri({ viewport: 'smartphone' });
  await registraSchedeFinte(app);
  const m = await misure(app);
  controlliComuni(m);
  assert.ok(Math.abs(m.nav.y + m.nav.h - m.finestra.h) < 2, 'navigazione in basso');
  assert.equal(new Set(m.schede.map((s) => s.x)).size, 1, 'una sola colonna');
  await ultimoPulsanteRaggiungibile(app);
});

test('layout desktop: navigazione laterale, dashboard su più colonne', async ({ apri }) => {
  const app = await apri({ viewport: 'desktop' });
  await registraSchedeFinte(app);
  const m = await misure(app);
  controlliComuni(m);
  assert.ok(m.nav.x < 5 && m.nav.h > m.nav.w, 'navigazione laterale');
  assert.ok(new Set(m.schede.map((s) => s.x)).size >= 2, 'schede su più colonne');
  await ultimoPulsanteRaggiungibile(app);
});
