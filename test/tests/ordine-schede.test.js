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
  return gruppoSchede(page).getByRole('checkbox').evaluateAll((c) => c.map((n) => n.labels[0].textContent.trim()));
}

test('la dashboard segue l\'ordine salvato, con le schede fisse in cima e le schede mancanti in coda', async ({ apri }) => {
  const app = await apri({
    rete: [meteoFinto()],
    scriptIniziale: conImpostazioni({ benvenutoVisto: false, ordineSchede: ['spesa', 'benvenuto', 'sconosciuta', 'casa', 'spesa', 'agenda'] })
  });
  await app.page.getByRole('region', { name: 'Benvenuti' }).waitFor();
  assert.deepEqual(await schedeDashboard(app.page), ['benvenuto', 'spesa', 'casa', 'agenda', 'meteo', 'attivita', 'foto']);
});
