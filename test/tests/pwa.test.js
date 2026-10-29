'use strict';
// PWA e funzionamento offline (ticket #12): manifest, icone, Service Worker, pre-cache, avviso di nuova versione.
const fs = require('fs');
const path = require('path');
const { test, assert, attendi } = require('../lib/test');
const statico = require('../lib/statico');

function leggiManifest(root) {
  const link = statico.riferimentiHtml(root, 'index.html').find((r) => r.rel === 'manifest');
  assert.ok(link, 'index.html collega un manifest con <link rel="manifest">');
  const file = path.posix.normalize(link.url);
  return { file: file, dati: JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')) };
}

test('il manifest è valido, con percorsi relativi e icone PNG 192/512 (anche maskable) e SVG', async ({ root }) => {
  const { file, dati } = leggiManifest(root);
  assert.equal(dati.name, 'Casa Nostra');
  assert.ok(dati.short_name && dati.short_name.length <= 12, 'short_name breve');
  assert.equal(dati.start_url, './');
  assert.equal(dati.scope, './');
  assert.equal(dati.display, 'standalone');
  assert.match(dati.theme_color, /^#[0-9a-f]{6}$/i);
  assert.match(dati.background_color, /^#[0-9a-f]{6}$/i);
  const icone = dati.icons || [];
  for (const ic of icone) {
    assert.ok(!/^(\/|https?:)/.test(ic.src), 'icona con percorso relativo: ' + ic.src);
    const f = path.join(root, path.posix.dirname(file), ic.src);
    assert.ok(fs.existsSync(f), 'icona esistente: ' + ic.src);
    if (ic.type === 'image/png') {
      const b = fs.readFileSync(f);
      assert.equal(b.toString('latin1', 1, 4), 'PNG', ic.src + ' è un PNG');
      const [w, h] = ic.sizes.split('x').map(Number);
      assert.equal(b.readUInt32BE(16), w, ic.src + ' larghezza');
      assert.equal(b.readUInt32BE(20), h, ic.src + ' altezza');
    }
  }
  const trova = (dim, scopo) => icone.find((ic) => ic.type === 'image/png' && ic.sizes === dim &&
    (ic.purpose || 'any').split(/\s+/).includes(scopo));
  for (const dim of ['192x192', '512x512']) {
    assert.ok(trova(dim, 'any'), 'icona PNG ' + dim);
    assert.ok(trova(dim, 'maskable'), 'icona PNG maskable ' + dim);
  }
  assert.ok(icone.some((ic) => ic.type === 'image/svg+xml'), 'icona SVG');
});

/** Esegue sw.js in una sandbox (senza installarlo) e restituisce le costanti dichiarate: { VERSIONE, RISORSE, ... }. */
function leggiServiceWorker(root) {
  const vm = require('vm');
  const sandbox = { self: { addEventListener: function () {}, location: { origin: 'http://localhost' } } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), sandbox, { filename: 'sw.js' });
  return sandbox;
}

/** Percorso normalizzato rispetto alla radice del sito ('./' -> '.'). */
function norm(daFile, url) {
  const f = path.posix.normalize(path.posix.join(path.posix.dirname(daFile), url.split('#')[0].split('?')[0]));
  return f.replace(/\/$/, '') || '.';
}

/** Risorse che la pagina deve avere offline: la pagina stessa, ciò che index.html carica, il manifest e le sue icone. */
function risorseNecessarie(root) {
  const necessarie = new Set(['.', 'index.html']);
  for (const r of statico.riferimentiHtml(root, 'index.html')) {
    if (r.tag === 'a') continue;
    necessarie.add(norm('index.html', r.url));
  }
  const { file, dati } = leggiManifest(root);
  for (const ic of dati.icons || []) necessarie.add(norm(file, ic.src));
  return necessarie;
}

test('la pre-cache del Service Worker coincide con le risorse di index.html e del manifest', async ({ root }) => {
  const sw = leggiServiceWorker(root);
  assert.match(String(sw.VERSIONE), /\S/, 'sw.js dichiara una costante VERSIONE');
  assert.ok(Array.isArray(sw.RISORSE), 'sw.js dichiara l\'elenco RISORSE');
  const inCache = new Set();
  for (const u of sw.RISORSE) {
    assert.ok(!/^(\/|https?:)/.test(u), 'percorso relativo in pre-cache: ' + u);
    const f = norm('sw.js', u);
    assert.ok(!inCache.has(f), 'voce doppia in pre-cache: ' + u);
    inCache.add(f);
    assert.ok(f === '.' || fs.existsSync(path.join(root, f)), 'file in pre-cache inesistente: ' + u);
  }
  const necessarie = risorseNecessarie(root);
  const mancanti = [...necessarie].filter((f) => !inCache.has(f));
  const superflue = [...inCache].filter((f) => !necessarie.has(f));
  assert.deepEqual(mancanti, [], 'da aggiungere a RISORSE in sw.js: ' + mancanti.join(', '));
  assert.deepEqual(superflue, [], 'in RISORSE di sw.js ma non usate da index.html/manifest: ' + superflue.join(', '));
});

test('ogni risorsa della stessa origine caricata dalla pagina è in pre-cache', async ({ apri, root, sito }) => {
  const inCache = new Set(leggiServiceWorker(root).RISORSE.map((u) => norm('sw.js', u)));
  const app = await apri({ attendiPronta: false });
  const usate = new Set();
  app.page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(sito.url)) return;
    const rel = norm('index.html', decodeURIComponent(new URL(u).pathname.slice(new URL(sito.url).pathname.length)) || '.');
    if (rel !== 'sw.js') usate.add(rel);
  });
  await app.ricarica();
  for (const hash of ['#/spesa', '#/agenda', '#/attivita', '#/casa', '#/foto', '#/impostazioni', '#/']) await app.vai(hash);
  await new Promise((r) => setTimeout(r, 300));
  const mancanti = [...usate].filter((f) => !inCache.has(f));
  assert.ok(usate.size > 5, 'richieste osservate');
  assert.deepEqual(mancanti, [], 'usate dalla pagina ma assenti da RISORSE in sw.js: ' + mancanti.join(', '));
});

/** Aspetta che il Service Worker controlli la pagina e che la pre-cache sia completa. */
async function attendiServiceWorker(app, root) {
  const attese = leggiServiceWorker(root).RISORSE.length;
  await attendi(async () => assert.ok(await app.page.evaluate(async function (n) {
    if (!navigator.serviceWorker.controller) return false;
    for (const nome of await caches.keys()) {
      if (nome.indexOf('casa-nostra-') === 0 && (await (await caches.open(nome)).keys()).length >= n) return true;
    }
    return false;
  }, attese), 'Service Worker attivo e pre-cache completa'), { timeout: 10000 });
}

async function titolo(page) { return (await page.locator('main h2').first().textContent()).trim(); }

test('dopo la prima visita l\'app si apre e funziona con la rete disattivata', async ({ apri, root }) => {
  const app = await apri({ serviceWorker: 'allow' });
  await attendiServiceWorker(app, root);
  await app.contesto.setOffline(true);
  await app.ricarica();
  assert.match(await app.page.title(), /Casa Nostra/);
  for (const [hash, nome] of [['#/spesa', /Spesa/], ['#/agenda', /Agenda/], ['#/attivita', /Attività/],
    ['#/casa', /Casa/], ['#/foto', /Foto/], ['#/impostazioni', /Impostazioni/]]) {
    await app.vai(hash);
    assert.match(await titolo(app.page), nome);
  }
  await app.vai('#/spesa');
  await app.page.getByLabel('Prodotto da aggiungere').fill('Uova');
  await app.page.getByRole('button', { name: 'Aggiungi', exact: true }).click();
  await app.page.getByRole('region', { name: /^Da comprare/ }).getByText('Uova').waitFor();
  await app.ricarica();
  await app.page.getByRole('region', { name: /^Da comprare/ }).getByText('Uova').waitFor();
  assert.equal(await app.page.locator('.toast-errore').count(), 0);
}, { timeout: 40000 });

test('le richieste a Open-Meteo non passano dal Service Worker', async ({ apri, root }) => {
  const app = await apri({ serviceWorker: 'allow' });
  await attendiServiceWorker(app, root);
  const traccia = await app.rete('https://api.open-meteo.com/**', { json: { current: { temperature_2m: 18 } } });
  const daServiceWorker = [];
  app.contesto.on('request', (r) => { if (r.serviceWorker() && /open-meteo/.test(r.url())) daServiceWorker.push(r.url()); });
  const risposta = app.page.waitForResponse(/open-meteo/);
  const dati = await app.page.evaluate(() =>
    fetch('https://api.open-meteo.com/v1/forecast?latitude=41.77&longitude=12.23&current=temperature_2m').then((r) => r.json()));
  assert.equal(dati.current.temperature_2m, 18);
  assert.equal((await risposta).fromServiceWorker(), false, 'risposta non servita dal Service Worker');
  assert.equal(traccia.richieste.length, 1, 'la richiesta della pagina va direttamente in rete');
  assert.deepEqual(daServiceWorker, [], 'nessuna richiesta a Open-Meteo fatta dal Service Worker');
});

/**
 * Il download dello script del Service Worker non passa dalle intercettazioni di Playwright: per simulare
 * un rilascio si serve una copia temporanea del sito (modificabile su disco) da un server dedicato.
 * fn riceve { apri, copia } con apri() uguale a quella del fixture ma sul server della copia.
 */
async function conCopiaDelSito(root, apriOriginale, fn) {
  const os = require('os');
  const { avviaServer } = require('../server');
  const { creaApri } = require('../lib/app');
  const copia = fs.mkdtempSync(path.join(os.tmpdir(), 'casa-nostra-pwa-'));
  fs.cpSync(root, copia, { recursive: true, filter: (s) => !path.basename(s).startsWith('.') || s === root });
  const sito = await avviaServer(copia, 0);
  // il browser si ottiene da un contesto aperto con l'apri del fixture (chiuso subito)
  const tmp = await apriOriginale({ attendiPronta: false });
  const browser = tmp.contesto.browser();
  await tmp.contesto.close();
  const apri = creaApri(browser, sito, {});
  try {
    await fn({ apri: apri, copia: copia });
    for (const app of apri._aperte) {
      const err = app.erroriNonGestiti();
      assert.deepEqual(err, [], 'errori non gestiti in console:\n' + err.map((e) => e.testo).join('\n'));
    }
  } finally {
    for (const app of apri._aperte) await app.contesto.close().catch(() => {});
    await sito.chiudi();
    fs.rmSync(copia, { recursive: true, force: true });
  }
}

test('aumentando la versione compare il toast, la cache vecchia sparisce e i dati restano', async ({ apri: apriFixture, root }) => {
  await conCopiaDelSito(root, apriFixture, async ({ apri, copia }) => {
  const app = await apri({ serviceWorker: 'allow' });
  await attendiServiceWorker(app, copia);
  const scheda = app.page.getByRole('region', { name: 'Spesa' });
  await scheda.getByLabel('Prodotto da aggiungere').fill('Pane');
  await scheda.getByLabel('Prodotto da aggiungere').press('Enter');
  await scheda.getByText('Pane').waitFor();
  await app.page.evaluate(async () => {
    localStorage.setItem('prova-pwa', 'resta');
    await (await caches.open('altra-app')).put('x', new Response('x'));
  });
  const fileSw = path.join(copia, 'sw.js');
  const nuova = leggiServiceWorker(copia).VERSIONE + '-nuova';
  const sorgente = fs.readFileSync(fileSw, 'utf8').replace(/var VERSIONE = '[^']*';/, "var VERSIONE = '" + nuova + "';");
  assert.notEqual(sorgente, fs.readFileSync(fileSw, 'utf8'), 'sw.js ha la riga var VERSIONE = \'...\';');
  fs.writeFileSync(fileSw, sorgente);

  await app.ricarica();
  const toast = app.page.getByRole('status').filter({ hasText: 'Nuova versione disponibile' });
  await toast.waitFor({ timeout: 10000 });
  await attendi(async () => assert.deepEqual((await app.page.evaluate(() => caches.keys())).sort(),
    ['altra-app', 'casa-nostra-' + nuova]));
  assert.equal(await app.page.evaluate(() => localStorage.getItem('prova-pwa')), 'resta');
  await app.page.getByRole('region', { name: 'Spesa' }).getByText('Pane').waitFor();

  await toast.getByRole('button', { name: 'Ricarica' }).click();
  await app.page.waitForEvent('load');
  await app.attendiPronta();
  await app.page.getByRole('region', { name: 'Spesa' }).getByText('Pane').waitFor();
  assert.equal(await app.page.getByText('Nuova versione disponibile').count(), 0);
  });
}, { timeout: 40000 });

async function controllaAppFunzionante(app) {
  await app.vai('#/spesa');
  await app.page.getByLabel('Prodotto da aggiungere').fill('Sale');
  await app.page.getByRole('button', { name: 'Aggiungi', exact: true }).click();
  await app.page.getByRole('region', { name: /^Da comprare/ }).getByText('Sale').waitFor();
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(await app.page.locator('.toast-errore').count(), 0, 'nessun toast di errore');
}

test('con la registrazione del Service Worker fallita l\'app funziona senza errori non gestiti', async ({ apri: apriFixture, root }) => {
  await conCopiaDelSito(root, apriFixture, async ({ apri, copia }) => {
    fs.rmSync(path.join(copia, 'sw.js'));
    const avvisi = [];
    // Messaggi di Chrome stesso sul download fallito di sw.js (non dell'app).
    const app = await apri({ serviceWorker: 'allow',
      consentiErrori: [/^A bad HTTP response code \(404\) was received when fetching the script\.$/, /Failed to load resource.*404/] });
    app.page.on('console', (m) => { if (m.type() === 'warning') avvisi.push(m.text()); });
    await app.ricarica();
    await controllaAppFunzionante(app);
    await attendi(async () => assert.ok(avvisi.some((t) => /Service Worker/.test(t)), 'fallimento registrato con console.warn'));
    assert.equal(await app.page.evaluate(() => !!navigator.serviceWorker.controller), false);
  });
});

test('senza Service Worker (bloccato o non supportato) l\'app funziona senza errori', async ({ apri }) => {
  await controllaAppFunzionante(await apri());
  await controllaAppFunzionante(await apri({
    scriptIniziale: function () { Object.defineProperty(Navigator.prototype, 'serviceWorker', { get: function () { return undefined; } }); }
  }));
});

test('la prima installazione del Service Worker non mostra l\'avviso di nuova versione', async ({ apri, root }) => {
  const app = await apri({ serviceWorker: 'allow' });
  await attendiServiceWorker(app, root);
  await app.ricarica();
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(await app.page.getByText('Nuova versione disponibile').count(), 0);
});
