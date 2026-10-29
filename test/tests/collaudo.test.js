'use strict';
// Collaudo finale (ticket #13): controlli trasversali su tutte le sezioni con dati reali,
// su ogni viewport della spec. Si agisce come un utente: si importa un backup, si scelgono foto, si naviga.
const { execFileSync } = require('child_process');
const { test, assert, attendi } = require('../lib/test');
const { meteoFinto } = require('../lib/meteo-finto');
const img = require('../lib/immagini');

const VIEWPORT_SPEC = ['tabletOrizzontale', 'tabletVerticale', 'smartphone', 'desktop'];
const ESCA = '<img src=x onerror="window.__iniettato=1">';

function datiCompleti(titolo) {
  const t = function (base) { return titolo ? base + ' ' + titolo : base; };
  return {
    app: 'casa-nostra', schemaVersion: 1, esportatoIl: '2026-03-05T10:00:00.000Z',
    dati: {
      prodotti: [
        { id: 'p1', nome: t('Latte x2'), acquistato: false, creatoIl: '2026-03-01T08:00:00.000Z', acquistatoIl: null },
        { id: 'p2', nome: t('Pane'), acquistato: true, creatoIl: '2026-03-01T08:01:00.000Z', acquistatoIl: '2026-03-02T09:00:00.000Z' }
      ],
      appuntamenti: [
        { id: 'a1', titolo: t('Dentista'), data: '2026-03-05', ora: '15:30', note: t('Portare la tessera'), creatoIl: '2026-03-01T08:00:00.000Z' },
        { id: 'a2', titolo: t('Compleanno della nonna con un titolo piuttosto lungo che deve andare a capo'), data: '2026-03-06', ora: '', note: '', creatoIl: '2026-03-01T08:02:00.000Z' },
        { id: 'a3', titolo: t('Vecchia visita'), data: '2026-02-01', ora: '09:00', note: '', creatoIl: '2026-01-01T08:03:00.000Z' }
      ],
      attivita: [
        { id: 't1', titolo: t('Chiamare l\'idraulico'), nota: t('Dopo le 9'), completata: false, creataIl: '2026-03-01T08:00:00.000Z', completataIl: null },
        { id: 't2', titolo: t('Pagare la mensa'), nota: '', completata: true, creataIl: '2026-03-01T08:00:00.000Z', completataIl: '2026-03-02T08:00:00.000Z' }
      ],
      promemoriaCasa: [
        { id: 'c1', titolo: t('Cambiare il filtro della caldaia'), categoria: 'manutenzione', data: '2026-03-01', note: t('Modello X'), intervalloGiorni: 90,
          completato: false, ultimoCompletamento: '2025-12-01', creatoIl: '2026-01-01T08:00:00.000Z' },
        { id: 'c2', titolo: t('Bollo auto'), categoria: 'scadenza', data: null, note: '', intervalloGiorni: null,
          completato: false, ultimoCompletamento: null, creatoIl: '2026-01-02T08:00:00.000Z' }
      ],
      impostazioni: [
        { id: 'impostazioni', nomeVisualizzato: t('Famiglia Rossi'), localita: { nome: 'Fiumicino', latitudine: 41.77, longitudine: 12.23 },
          schedeVisibili: {}, schermoAcceso: false, ultimoBackup: '2026-03-04T10:00:00.000Z', benvenutoVisto: true, avvisoBackupPosticipatoFino: null }
      ]
    }
  };
}

/** Come un utente: importa un backup completo dalle impostazioni e aggiunge due foto dalla galleria. */
async function popola(app, titolo) {
  await app.vai('#/impostazioni');
  const backup = JSON.stringify(datiCompleti(titolo));
  await app.page.getByRole('region', { name: 'Backup dati' }).getByLabel('Importa un backup dati')
    .setInputFiles({ name: 'casa-nostra-backup-2026-03-04.json', mimeType: 'application/json', buffer: Buffer.from(backup, 'utf8') });
  await app.page.getByRole('dialog').getByRole('button', { name: 'Importa' }).click();
  await attendi(async () => assert.equal(await app.page.getByRole('dialog').count(), 0));
  await app.vai('#/foto');
  const foto = [
    await img.crea(app.page, { larghezza: 2400, altezza: 1600, nome: 'mare.jpg' }),
    await img.crea(app.page, { larghezza: 600, altezza: 800, tipo: 'image/png', nome: 'ritratto.png', colore: '#d9b48f' })
  ];
  await app.page.getByLabel('Aggiungi foto').setInputFiles(foto);
  await attendi(async () => assert.equal(await app.page.locator('main img').count(), 2), { timeout: 10000 });
}

/** Indirizzi della barra di navigazione, nell'ordine in cui compaiono. */
async function sezioni(app) {
  return app.page.locator('nav a').evaluateAll((a) => a.map((n) => n.getAttribute('href')));
}

/** Misure di leggibilità e di uso con le dita della vista corrente. */
function misure(page) {
  return page.evaluate(() => {
    const visibile = (n) => {
      if (n.offsetParent === null && getComputedStyle(n).position !== 'fixed') return false;
      const b = n.getBoundingClientRect();
      return b.width > 0 && b.height > 0;
    };
    const piccoli = Array.from(document.querySelectorAll('nav a, header button, main button, main a, main input, main select, main textarea, main summary, [role=region] button'))
      .filter((n) => visibile(n) && n.type !== 'checkbox' && n.type !== 'radio' && n.type !== 'file')
      .map((n) => { const b = n.getBoundingClientRect(); return { el: n.tagName + ' "' + (n.textContent || n.getAttribute('aria-label') || n.name || n.type).trim().slice(0, 40) + '"', w: Math.round(b.width), h: Math.round(b.height) }; })
      .filter((m) => m.h < 48 || m.w < 48);
    const caselle = Array.from(document.querySelectorAll('main input[type=checkbox], main input[type=radio]'))
      .filter(visibile)
      .filter((n) => {
        // la casella conta come area toccabile insieme alla sua etichetta
        const area = n.closest('label') || (n.id && document.querySelector('label[for="' + n.id + '"]')) || n;
        const b = area.getBoundingClientRect();
        return b.height < 48;
      })
      .map((n) => 'casella "' + ((n.closest('label') || {}).textContent || n.getAttribute('aria-label') || '').trim().slice(0, 40) + '"');
    return {
      titolo: (document.querySelector('main h2') || {}).textContent || null,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      font: parseFloat(getComputedStyle(document.body).fontSize),
      piccoli: piccoli,
      caselle: caselle
    };
  });
}

for (const viewport of VIEWPORT_SPEC) {
  test('collaudo ' + viewport + ': con dati in tutte le sezioni ogni pagina è leggibile, toccabile e senza scorrimento orizzontale', async ({ apri }) => {
    const app = await apri({ viewport: viewport, ora: '2026-03-05T10:00', rete: [meteoFinto()] });
    await popola(app);
    const percorsi = await sezioni(app);
    assert.ok(percorsi.length >= 7, 'la navigazione elenca tutte le sezioni: ' + percorsi.join(', '));
    const problemi = [];
    for (const p of percorsi) {
      await app.vai(p);
      const m = await misure(app.page);
      if (p !== '#/' && !m.titolo) problemi.push(p + ': manca il titolo della pagina');
      if (m.overflow > 0) problemi.push(p + ': scorrimento orizzontale di ' + m.overflow + ' px');
      if (m.font < 18) problemi.push(p + ': testo base di ' + m.font + ' px');
      m.piccoli.forEach((x) => problemi.push(p + ': area toccabile ' + x.w + '×' + x.h + ' per ' + x.el));
      m.caselle.forEach((x) => problemi.push(p + ': ' + x + ' più bassa di 48 px'));
    }
    assert.deepEqual(problemi, []);
    // la dashboard mostra tutte le schede con i dati importati
    await app.vai('#/');
    for (const nome of ['Meteo', 'Agenda', 'Attività', 'Spesa', 'Casa', 'Foto']) {
      assert.equal(await app.page.getByRole('region', { name: nome, exact: true }).count(), 1, 'scheda ' + nome);
    }
    const testo = await app.page.locator('main').textContent();
    for (const atteso of ['Dentista', 'Latte x2', 'Chiamare l\'idraulico', 'Cambiare il filtro della caldaia']) {
      assert.ok(testo.includes(atteso), 'la dashboard mostra "' + atteso + '"');
    }
    assert.deepEqual(app.richiesteEsterne, []);
  }, { timeout: 60000 });
}

test('dopo il ricaricamento tutte le sezioni ritrovano i loro dati, foto comprese', async ({ apri }) => {
  const app = await apri({ ora: '2026-03-05T10:00', rete: [meteoFinto()] });
  await popola(app);
  await app.ricarica();
  const attesi = {
    '#/spesa': ['Latte x2', 'Pane'],
    '#/agenda': ['Dentista', 'Compleanno della nonna'],
    '#/attivita': ['Chiamare l\'idraulico'],
    '#/casa': ['Cambiare il filtro della caldaia', 'Bollo auto']
  };
  for (const p of Object.keys(attesi)) {
    await app.vai(p);
    const testo = await app.page.locator('main').textContent();
    for (const a of attesi[p]) assert.ok(testo.includes(a), p + ' contiene "' + a + '"');
  }
  await app.vai('#/foto');
  assert.equal(await app.page.locator('main img').count(), 2);
  assert.equal(await app.page.getByRole('banner').getByRole('heading', { level: 1 }).textContent(), 'Famiglia Rossi');
});

test('il testo inserito dall\'utente non viene mai interpretato come HTML, in nessuna pagina', async ({ apri }) => {
  const app = await apri({ ora: '2026-03-05T10:00', rete: [meteoFinto()] });
  await popola(app, ESCA);
  for (const p of await sezioni(app)) {
    await app.vai(p);
    assert.equal(await app.page.locator('main img[src="x"], header img[src="x"]').count(), 0, p + ': nessun elemento creato dal testo');
  }
  await app.vai('#/');
  assert.ok((await app.page.locator('main').textContent()).includes(ESCA), 'il testo compare letteralmente');
  assert.ok((await app.page.getByRole('banner').textContent()).includes('Famiglia Rossi ' + ESCA));
  assert.equal(await app.page.evaluate(() => window.__iniettato), undefined);
}, { timeout: 45000 });

test('l\'app non chiede mai permessi: notifiche, posizione, fotocamera e microfono', async ({ apri }) => {
  const app = await apri({
    ora: '2026-03-05T10:00',
    rete: [meteoFinto()],
    scriptIniziale: function () {
      window.__permessi = [];
      const segna = (nome) => function () { window.__permessi.push(nome); return Promise.reject(new Error('negato')); };
      if (window.Notification) window.Notification.requestPermission = segna('notifiche');
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition = segna('posizione');
        navigator.geolocation.watchPosition = segna('posizione');
      }
      if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = segna('fotocamera');
      if (window.PushManager) window.PushManager.prototype.subscribe = segna('push');
    }
  });
  await popola(app);
  for (const p of await sezioni(app)) await app.vai(p);
  assert.deepEqual(await app.page.evaluate(() => window.__permessi), []);
  await app.vai('#/foto');
  const scelta = app.page.getByLabel('Aggiungi foto');
  assert.equal(await scelta.getAttribute('accept'), 'image/*');
  assert.equal(await scelta.evaluate((n) => n.multiple), true);
  assert.equal(await scelta.getAttribute('capture'), null, 'nessuna apertura forzata della fotocamera');
});

test('il repository contiene solo codice e risorse statiche: niente foto, backup, archivi né Node', async ({ root }) => {
  // l'unico Node ammesso è il manifesto della suite di test (ADR-0003); node_modules resta vietato ovunque
  const suite = new Set(['test/package.json', 'test/package-lock.json']);
  const file = execFileSync('git', ['-C', root, 'ls-files'], { encoding: 'utf8' }).split(/\r?\n/).filter((f) => f && !suite.has(f));
  const sospetti = file.filter((f) =>
    /\.(zip|jpe?g|webp|gif|heic|bmp)$/i.test(f) ||
    (/\.png$/i.test(f) && !f.startsWith('icone/')) ||
    /casa-nostra-(backup|foto)-/i.test(f) ||
    (/\.json$/i.test(f)) ||
    /(^|\/)(node_modules|package\.json|package-lock\.json)/.test(f));
  assert.deepEqual(sospetti, []);
});

for (const viewport of ['smartphone', 'tabletOrizzontale']) {
  test('collaudo ' + viewport + ': i moduli più lunghi stanno nello schermo e i loro controlli sono toccabili', async ({ apri }) => {
    const app = await apri({ viewport: viewport, ora: '2026-03-05T10:00', rete: [meteoFinto()] });
    await popola(app);
    const problemi = [];
    for (const [percorso, pulsante] of [['#/agenda', 'Nuovo appuntamento'], ['#/casa', 'Nuovo promemoria'], ['#/casa', 'Modifica Bollo auto']]) {
      if (!(await app.page.evaluate(() => location.hash)).endsWith(percorso.slice(1))) await app.vai(percorso);
      await app.page.getByRole('button', { name: pulsante }).click();
      const dialogo = app.page.getByRole('dialog');
      await dialogo.waitFor();
      const m = await dialogo.evaluate((d) => {
        const b = d.getBoundingClientRect();
        const piccoli = Array.from(d.querySelectorAll('button, input, select, textarea'))
          .filter((n) => n.offsetParent !== null && n.type !== 'checkbox')
          .map((n) => { const r = n.getBoundingClientRect(); return { el: n.tagName + ' ' + (n.name || n.textContent.trim()), h: Math.round(r.height) }; })
          .filter((x) => x.h < 48);
        return { sinistra: b.left, destra: b.right, finestra: innerWidth, scorre: d.scrollHeight > d.clientHeight + 1 ? getComputedStyle(d).overflowY : 'no', alto: b.height, altezza: innerHeight, piccoli: piccoli };
      });
      if (m.sinistra < 0 || m.destra > m.finestra) problemi.push(pulsante + ': il dialogo esce dallo schermo in larghezza');
      if (m.alto > m.altezza + 1 && m.scorre === 'no') problemi.push(pulsante + ': il dialogo è più alto dello schermo e non scorre');
      m.piccoli.forEach((x) => problemi.push(pulsante + ': ' + x.el + ' alto ' + x.h + ' px'));
      await app.page.keyboard.press('Escape');
      await attendi(async () => assert.equal(await dialogo.count(), 0));
    }
    assert.deepEqual(problemi, []);
  });
}