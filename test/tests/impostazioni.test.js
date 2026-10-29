'use strict';
// Impostazioni generali e benvenuto (ticket #7).
const { test, assert, attendi } = require('../lib/test');
const { senzaBenvenuto } = require('../lib/benvenuto');

function schedaBenvenuto(page) { return page.getByRole('region', { name: 'Benvenuti' }); }

test('la scheda di benvenuto compare al primo avvio e dopo "Ho capito" non ricompare', async ({ apri }) => {
  const app = await apri();
  const scheda = schedaBenvenuto(app.page);
  await scheda.waitFor();
  assert.match(await scheda.textContent(), /restano nel browser di questo dispositivo/);
  await scheda.getByRole('button', { name: 'Imposta nome e località' }).waitFor();
  await scheda.getByRole('button', { name: 'Ho capito' }).click();
  await attendi(async () => assert.equal(await schedaBenvenuto(app.page).count(), 0));
  await app.ricarica();
  await app.page.getByRole('region', { name: 'Spesa' }).waitFor();
  assert.equal(await schedaBenvenuto(app.page).count(), 0);
});

test('"Imposta nome e località" porta alle impostazioni; il nome modificato compare nella dashboard e persiste', async ({ apri }) => {
  const app = await apri();
  await schedaBenvenuto(app.page).getByRole('button', { name: 'Imposta nome e località' }).click();
  await app.attendiPronta();
  assert.match(app.page.url(), /#\/impostazioni$/);
  await app.page.getByLabel('Nome mostrato').fill('  Famiglia Rossi ');
  await app.page.getByRole('button', { name: 'Salva il nome' }).click();
  const nome = () => app.page.getByRole('banner').getByRole('heading', { level: 1 });
  await attendi(async () => assert.equal(await nome().textContent(), 'Famiglia Rossi'));
  await app.vai('#/');
  await app.ricarica();
  assert.equal(await nome().textContent(), 'Famiglia Rossi');
  await app.vai('#/impostazioni');
  assert.equal(await app.page.getByLabel('Nome mostrato').inputValue(), 'Famiglia Rossi');
});

// Wake Lock finto: registra le richieste in window.__wakeLock.richieste; il browser lo rilascia quando la pagina è nascosta.
function wakeLockFinto() {
  const stato = { richieste: [], attive: [] };
  window.__wakeLock = stato;
  const api = {
    request: function (tipo) {
      stato.richieste.push(tipo);
      const s = new EventTarget();
      s.type = tipo; s.released = false;
      s.release = function () { if (!s.released) { s.released = true; s.dispatchEvent(new Event('release')); } return Promise.resolve(); };
      stato.attive.push(s);
      return Promise.resolve(s);
    }
  };
  Object.defineProperty(Navigator.prototype, 'wakeLock', { get: function () { return api; }, configurable: true });
}

async function cambiaVisibilita(page, stato) {
  await page.evaluate((v) => {
    Object.defineProperty(document, 'visibilityState', { value: v, configurable: true });
    Object.defineProperty(document, 'hidden', { value: v === 'hidden', configurable: true });
    if (v === 'hidden') window.__wakeLock.attive.forEach((s) => s.release());
    document.dispatchEvent(new Event('visibilitychange'));
  }, stato);
}

const richiesteWakeLock = (page) => page.evaluate(() => window.__wakeLock.richieste.slice());

test('senza l\'API Wake Lock il controllo "Mantieni lo schermo acceso" non compare', async ({ apri }) => {
  const app = await apri({
    percorso: '#/impostazioni',
    scriptIniziale: () => { delete Navigator.prototype.wakeLock; }
  });
  await app.page.getByLabel('Nome mostrato').waitFor();
  assert.equal(await app.page.getByText('Mantieni lo schermo acceso').count(), 0);
});

test('"Mantieni lo schermo acceso" è spento per default, chiede il wake lock e lo riacquisisce al ritorno sulla pagina', async ({ apri }) => {
  const app = await apri({ percorso: '#/impostazioni', scriptIniziale: wakeLockFinto });
  const casella = app.page.getByRole('checkbox', { name: 'Mantieni lo schermo acceso' });
  assert.equal(await casella.isChecked(), false);
  assert.deepEqual(await richiesteWakeLock(app.page), []);
  await casella.check();
  await attendi(async () => assert.deepEqual(await richiesteWakeLock(app.page), ['screen']));
  await cambiaVisibilita(app.page, 'hidden');
  await cambiaVisibilita(app.page, 'visible');
  await attendi(async () => assert.deepEqual(await richiesteWakeLock(app.page), ['screen', 'screen']));

  // l'impostazione persiste e il wake lock è richiesto già all'avvio
  await app.ricarica();
  await attendi(async () => assert.deepEqual(await richiesteWakeLock(app.page), ['screen']));
  assert.equal(await app.page.getByRole('checkbox', { name: 'Mantieni lo schermo acceso' }).isChecked(), true);

  // spegnendolo il wake lock viene rilasciato e non è più richiesto
  await app.page.getByRole('checkbox', { name: 'Mantieni lo schermo acceso' }).uncheck();
  await attendi(async () => assert.equal(await app.page.evaluate(() => window.__wakeLock.attive.every((s) => s.released)), true));
  await cambiaVisibilita(app.page, 'hidden');
  await cambiaVisibilita(app.page, 'visible');
  await app.page.waitForTimeout(200);
  assert.deepEqual(await richiesteWakeLock(app.page), ['screen']);
});

test('il testo sulla privacy è sempre consultabile nelle impostazioni, anche dopo "Ho capito"', async ({ apri }) => {
  const app = await apri();
  await schedaBenvenuto(app.page).getByRole('button', { name: 'Ho capito' }).click();
  await attendi(async () => assert.equal(await schedaBenvenuto(app.page).count(), 0));
  await app.vai('#/impostazioni');
  const privacy = app.page.getByRole('region', { name: 'Privacy e dati' });
  const testo = await privacy.textContent();
  assert.match(testo, /restano nel browser di questo dispositivo/);
  assert.match(testo, /Cancellare i dati del sito.*ripristinare il tablet li elimina/);
  assert.match(testo, /backup spetta a te/);
  assert.match(testo, /Non c'è sincronizzazione fra dispositivi/);
});

test('le impostazioni sono salvate in IndexedDB e non in LocalStorage', async ({ apri }) => {
  const app = await apri({ percorso: '#/impostazioni' });
  await app.page.getByLabel('Nome mostrato').fill('Casa Bianchi');
  await app.page.getByRole('button', { name: 'Salva il nome' }).click();
  await attendi(async () => assert.equal(await app.page.getByRole('banner').getByRole('heading', { level: 1 }).textContent(), 'Casa Bianchi'));
  const salvato = await app.page.evaluate(() => new Promise((ok, ko) => {
    const r = indexedDB.open('casa-nostra');
    r.onerror = () => ko(r.error);
    r.onsuccess = () => {
      const g = r.result.transaction('impostazioni').objectStore('impostazioni').getAll();
      g.onsuccess = () => { r.result.close(); ok({ record: g.result, localStorage: Object.keys(localStorage) }); };
    };
  }));
  assert.equal(salvato.record.length, 1);
  assert.equal(salvato.record[0].nomeVisualizzato, 'Casa Bianchi');
  assert.ok(!salvato.localStorage.some((k) => /impostazioni|nome/i.test(k)), 'nessuna impostazione in LocalStorage');
});

test('con l\'helper senzaBenvenuto la scheda di benvenuto non compare (per i test delle altre sezioni)', async ({ apri }) => {
  const app = await apri({ scriptIniziale: senzaBenvenuto });
  await app.page.getByRole('region', { name: 'Spesa' }).waitFor();
  assert.equal(await schedaBenvenuto(app.page).count(), 0);
});

function gruppoSchede(page) { return page.getByRole('region', { name: 'Schede della dashboard' }); }

test('nascondere una scheda la toglie dalla dashboard, la sezione resta raggiungibile e la scelta persiste', async ({ apri }) => {
  const app = await apri({ percorso: '#/impostazioni' });
  const spesa = gruppoSchede(app.page).getByRole('checkbox', { name: 'Spesa' });
  assert.equal(await spesa.isChecked(), true);
  // la scheda di benvenuto non si può nascondere: niente interruttore
  assert.equal(await gruppoSchede(app.page).getByRole('checkbox', { name: 'Benvenuti' }).count(), 0);
  await spesa.uncheck();
  await attendi(async () => assert.equal(await spesa.isEnabled(), true)); // salvataggio concluso
  await app.vai('#/');
  await app.ricarica();
  await schedaBenvenuto(app.page).waitFor();
  assert.equal(await app.page.getByRole('region', { name: 'Spesa' }).count(), 0);
  await app.page.getByRole('navigation', { name: 'Sezioni' }).getByRole('link', { name: 'Spesa' }).click();
  // hashchange è asincrono: lo stato "pronta" della vista precedente non basta, si aspetta il titolo nuovo
  await attendi(async () => assert.match(await app.page.locator('main h2').first().textContent(), /Spesa/));
  await app.attendiPronta();
  await app.vai('#/impostazioni');
  assert.equal(await gruppoSchede(app.page).getByRole('checkbox', { name: 'Spesa' }).isChecked(), false);
  await gruppoSchede(app.page).getByRole('checkbox', { name: 'Spesa' }).check();
  await attendi(async () => assert.equal(await spesa.isEnabled(), true));
  await app.vai('#/');
  await app.page.getByRole('region', { name: 'Spesa' }).waitFor();
});

test('le schede registrate da altre sezioni diventano nascondibili senza altro codice', async ({ apri }) => {
  const app = await apri();
  await app.page.evaluate(() => {
    CasaNostra.ui.registraScheda({ id: 'prova', titolo: 'Prova nascondibile', ordine: 99,
      disegna: (corpo) => { corpo.appendChild(CasaNostra.ui.el('p', { testo: 'Contenuto di prova' })); } });
    return CasaNostra.ui.ridisegna();
  });
  await app.page.getByRole('region', { name: 'Prova nascondibile' }).waitFor();
  await app.vai('#/impostazioni');
  const prova = gruppoSchede(app.page).getByRole('checkbox', { name: 'Prova nascondibile' });
  await prova.uncheck();
  await attendi(async () => assert.equal(await prova.isEnabled(), true)); // salvataggio concluso
  await app.vai('#/');
  await app.page.getByRole('region', { name: 'Spesa' }).waitFor();
  assert.equal(await app.page.getByRole('region', { name: 'Prova nascondibile' }).count(), 0);
});
