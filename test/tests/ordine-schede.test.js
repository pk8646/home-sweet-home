'use strict';
// Ordine delle schede della dashboard scelto dalle Impostazioni con i pulsanti ▲▼ (ticket #19, spec #18).
const { test, assert, attendi } = require('../lib/test');
const { conDatiIniziali } = require('../lib/benvenuto');
const { meteoFinto } = require('../lib/meteo-finto');

const PREDEFINITO = ['meteo', 'agenda', 'attivita', 'spesa', 'casa', 'foto'];

function conImpostazioni(campi) {
  return conDatiIniziali({ impostazioni: [Object.assign({ id: 'impostazioni', benvenutoVisto: true }, campi)] });
}

/** Gli id delle schede nella griglia della dashboard, dall'alto in basso. */
function schedeDashboard(page) {
  return page.locator('.dashboard-griglia > section[data-scheda]').evaluateAll((s) => s.map((n) => n.getAttribute('data-scheda')));
}

function gruppoSchede(page) { return page.getByRole('region', { name: 'Schede della dashboard' }); }

/** I nomi delle schede elencate nel gruppo "Schede della dashboard", dall'alto in basso. */
function righeImpostazioni(page) {
  return gruppoSchede(page).getByRole('checkbox').evaluateAll((caselle) => caselle.map((c) => Array.prototype.filter
    .call(c.labels[0].childNodes, (n) => !(n.getAttribute && n.getAttribute('aria-hidden') === 'true'))
    .map((n) => n.textContent).join('').trim()));
}

test('la dashboard segue l\'ordine salvato, con le schede fisse in cima e le schede mancanti in coda', async ({ apri }) => {
  const app = await apri({
    rete: [meteoFinto()],
    scriptIniziale: conImpostazioni({ benvenutoVisto: false, ordineSchede: ['spesa', 'benvenuto', 'sconosciuta', 'casa', 'spesa', 'agenda'] })
  });
  await app.page.getByRole('region', { name: 'Benvenuti' }).waitFor();
  assert.deepEqual(await schedeDashboard(app.page), ['benvenuto', 'spesa', 'casa', 'agenda', 'meteo', 'attivita', 'foto']);
});

test('▲▼ nelle Impostazioni riordinano le schede, i pulsanti ai bordi sono disattivati e il focus resta sul pulsante', async ({ apri }) => {
  const app = await apri({ percorso: '#/impostazioni', rete: [meteoFinto()], scriptIniziale: conImpostazioni({}) });
  const gruppo = gruppoSchede(app.page);
  assert.deepEqual(await righeImpostazioni(app.page), ['Meteo', 'Agenda', 'Attività', 'Spesa', 'Casa', 'Foto']);
  assert.equal(await gruppo.getByRole('button', { name: 'Sposta Meteo su' }).isDisabled(), true);
  assert.equal(await gruppo.getByRole('button', { name: 'Sposta Foto giù' }).isDisabled(), true);
  assert.equal(await gruppo.getByRole('button', { name: 'Sposta Meteo giù' }).isDisabled(), false);

  // Tre pressioni ravvicinate da tastiera: la scheda sale fino in cima, il focus non si sposta.
  const suSpesa = gruppo.getByRole('button', { name: 'Sposta Spesa su' });
  await suSpesa.focus();
  await app.page.keyboard.press('Enter');
  await app.page.keyboard.press('Enter');
  await app.page.keyboard.press('Enter');
  assert.deepEqual(await righeImpostazioni(app.page), ['Spesa', 'Meteo', 'Agenda', 'Attività', 'Casa', 'Foto']);
  assert.equal(await suSpesa.evaluate((b) => b === document.activeElement), true, 'il focus resta su "Sposta Spesa su"');
  assert.equal(await suSpesa.isDisabled(), true);
  await gruppo.getByRole('button', { name: 'Sposta Casa giù' }).click();
  assert.deepEqual(await righeImpostazioni(app.page), ['Spesa', 'Meteo', 'Agenda', 'Attività', 'Foto', 'Casa']);

  const atteso = ['spesa', 'meteo', 'agenda', 'attivita', 'foto', 'casa'];
  await app.vai('#/');
  assert.deepEqual(await schedeDashboard(app.page), atteso);
  await app.ricarica();
  assert.deepEqual(await schedeDashboard(app.page), atteso);
  await app.vai('#/impostazioni');
  assert.deepEqual(await righeImpostazioni(app.page), ['Spesa', 'Meteo', 'Agenda', 'Attività', 'Foto', 'Casa']);
});

test('"Ripristina ordine predefinito" riporta subito l\'ordine originale, anche dopo una ricarica', async ({ apri }) => {
  const app = await apri({ percorso: '#/impostazioni', rete: [meteoFinto()], scriptIniziale: conImpostazioni({ ordineSchede: ['foto', 'casa', 'spesa'] }) });
  assert.deepEqual(await righeImpostazioni(app.page), ['Foto', 'Casa', 'Spesa', 'Meteo', 'Agenda', 'Attività']);
  await gruppoSchede(app.page).getByRole('button', { name: 'Ripristina ordine predefinito' }).click();
  assert.equal(await app.page.getByRole('dialog').count(), 0, 'nessun dialogo di conferma');
  assert.deepEqual(await righeImpostazioni(app.page), ['Meteo', 'Agenda', 'Attività', 'Spesa', 'Casa', 'Foto']);
  await app.vai('#/');
  assert.deepEqual(await schedeDashboard(app.page), PREDEFINITO);
  await app.ricarica();
  assert.deepEqual(await schedeDashboard(app.page), PREDEFINITO);
});

test('una scheda nascosta conserva la sua posizione e ricompare lì quando viene riattivata', async ({ apri }) => {
  const app = await apri({ percorso: '#/impostazioni', rete: [meteoFinto()], scriptIniziale: conImpostazioni({ ordineSchede: ['spesa', 'agenda', 'meteo'] }) });
  const agenda = gruppoSchede(app.page).getByRole('checkbox', { name: 'Agenda' });
  await agenda.uncheck();
  await attendi(async () => assert.equal(await agenda.isEnabled(), true));
  assert.deepEqual(await righeImpostazioni(app.page), ['Spesa', 'Agenda', 'Meteo', 'Attività', 'Casa', 'Foto']);
  await app.vai('#/');
  assert.deepEqual(await schedeDashboard(app.page), ['spesa', 'meteo', 'attivita', 'casa', 'foto']);
  await app.vai('#/impostazioni');
  await gruppoSchede(app.page).getByRole('button', { name: 'Sposta Meteo giù' }).click();
  await gruppoSchede(app.page).getByRole('checkbox', { name: 'Agenda' }).check();
  await app.vai('#/');
  assert.deepEqual(await schedeDashboard(app.page), ['spesa', 'agenda', 'attivita', 'meteo', 'casa', 'foto']);
});

test('una scheda che esce dalla griglia e poi rientra torna nella sua posizione dell\'ordine delle schede', async ({ apri }) => {
  const app = await apri({ rete: [meteoFinto()], scriptIniziale: conImpostazioni({ ordineSchede: ['casa', 'prova', 'meteo'] }) });
  await app.page.evaluate(() => {
    window.__provaVuota = false;
    CasaNostra.ui.registraScheda({ id: 'prova', titolo: 'Prova', ordine: 99,
      disegna: (corpo, contesto) => {
        window.__ridisegnaProva = contesto.ridisegna;
        if (window.__provaVuota) return false;
        corpo.appendChild(CasaNostra.ui.el('p', { testo: 'Contenuto di prova' }));
      } });
    return CasaNostra.ui.ridisegna();
  });
  await app.page.getByRole('region', { name: 'Prova' }).waitFor();
  assert.deepEqual(await schedeDashboard(app.page), ['casa', 'prova', 'meteo', 'agenda', 'attivita', 'spesa', 'foto']);
  await app.page.evaluate(() => { window.__provaVuota = true; return window.__ridisegnaProva(); });
  assert.deepEqual(await schedeDashboard(app.page), ['casa', 'meteo', 'agenda', 'attivita', 'spesa', 'foto']);
  await app.page.evaluate(() => { window.__provaVuota = false; return window.__ridisegnaProva(); });
  assert.deepEqual(await schedeDashboard(app.page), ['casa', 'prova', 'meteo', 'agenda', 'attivita', 'spesa', 'foto']);
});

// Con window.__guasto = true la scrittura nella raccolta 'impostazioni' fallisce, come con lo spazio esaurito.
function guastoImpostazioni() {
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function () {
    if (window.__guasto && this.name === 'impostazioni') throw new DOMException('Spazio finito', 'QuotaExceededError');
    return put.apply(this, arguments);
  };
}

test('se il salvataggio dell\'ordine fallisce l\'ordine sullo schermo torna quello di prima e compare un messaggio', async ({ apri }) => {
  const app = await apri({
    percorso: '#/impostazioni', rete: [meteoFinto()],
    scriptIniziale: conImpostazioni({ ordineSchede: ['spesa'] }) + '(' + guastoImpostazioni + ')();'
  });
  const prima = ['Spesa', 'Meteo', 'Agenda', 'Attività', 'Casa', 'Foto'];
  assert.deepEqual(await righeImpostazioni(app.page), prima);
  await app.page.evaluate(() => { window.__guasto = true; });
  await gruppoSchede(app.page).getByRole('button', { name: 'Sposta Spesa giù' }).click();
  await attendi(async () => assert.match(await app.page.locator('body').textContent(), /Spazio esaurito/));
  await attendi(async () => assert.deepEqual(await righeImpostazioni(app.page), prima));
  assert.equal(await gruppoSchede(app.page).getByRole('button', { name: 'Sposta Spesa su' }).isDisabled(), true);
  await app.page.evaluate(() => { window.__guasto = false; });
  await app.vai('#/');
  assert.deepEqual(await schedeDashboard(app.page), ['spesa', 'meteo', 'agenda', 'attivita', 'casa', 'foto']);
});

// window.__lettureGuaste = n: le prossime n letture della raccolta 'impostazioni' falliscono (Infinity = tutte).
function guastoLettura() {
  const get = IDBObjectStore.prototype.get;
  window.__lettureGuaste = 0;
  IDBObjectStore.prototype.get = function () {
    if (window.__lettureGuaste > 0 && this.name === 'impostazioni') {
      window.__lettureGuaste--;
      throw new DOMException('Lettura impossibile', 'UnknownError');
    }
    return get.apply(this, arguments);
  };
}

test('se la lettura delle impostazioni fallisce durante un cambio d\'ordine lo schermo torna all\'ordine salvato', async ({ apri }) => {
  const app = await apri({
    percorso: '#/impostazioni', rete: [meteoFinto()],
    scriptIniziale: conImpostazioni({ ordineSchede: ['spesa'] }) + '(' + guastoLettura + ')();'
  });
  const prima = ['Spesa', 'Meteo', 'Agenda', 'Attività', 'Casa', 'Foto'];
  assert.deepEqual(await righeImpostazioni(app.page), prima);
  const giuSpesa = gruppoSchede(app.page).getByRole('button', { name: 'Sposta Spesa giù' });

  // fallisce solo la lettura del salvataggio: lo schermo mostra l'ordine che c'è davvero nel database
  await app.page.evaluate(() => { window.__lettureGuaste = 1; });
  await giuSpesa.click();
  await attendi(async () => assert.equal(await app.page.locator('.toast').count() > 0, true));
  await attendi(async () => assert.deepEqual(await righeImpostazioni(app.page), prima));

  // fallisce anche la rilettura: lo schermo torna all'ordine di prima del gesto
  await app.page.evaluate(() => { window.__lettureGuaste = Infinity; });
  await giuSpesa.click();
  await attendi(async () => assert.deepEqual(await righeImpostazioni(app.page), prima));
  assert.equal(await gruppoSchede(app.page).getByRole('button', { name: 'Sposta Spesa su' }).isDisabled(), true);

  await app.page.evaluate(() => { window.__lettureGuaste = 0; });
  await app.vai('#/');
  assert.deepEqual(await schedeDashboard(app.page), ['spesa', 'meteo', 'agenda', 'attivita', 'casa', 'foto']);
});
