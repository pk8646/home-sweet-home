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
