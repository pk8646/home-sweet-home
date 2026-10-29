'use strict';
// Agenda familiare (ticket #4): pagina Agenda e scheda della dashboard.
const { test, assert, attendi } = require('../lib/test');
const { meteoFinto } = require('../lib/meteo-finto');

function areaInProgramma(page) { return page.getByRole('main').getByRole('region', { name: /^In programma/ }); }
function schedaAgenda(page) { return page.getByRole('region', { name: 'Agenda', exact: true }); }

async function titoli(area) {
  return area.locator('.appuntamento-titolo').allTextContents();
}

async function nuovoAppuntamento(page, { titolo, data, ora, note }) {
  await page.getByRole('button', { name: 'Nuovo appuntamento' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Nuovo appuntamento' });
  await dialogo.waitFor();
  await dialogo.getByLabel('Titolo').fill(titolo);
  if (data !== undefined) await dialogo.getByLabel('Data').fill(data);
  if (ora !== undefined) await dialogo.getByLabel(/^Ora/).fill(ora);
  if (note !== undefined) await dialogo.getByLabel(/^Note/).fill(note);
  await dialogo.getByRole('button', { name: 'Salva' }).click();
  await attendi(async () => assert.equal(await page.getByRole('dialog').count(), 0));
}

test('si aggiunge un appuntamento con titolo, data, ora e note che resta dopo il ricaricamento', async ({ apri }) => {
  const app = await apri({ percorso: '#/agenda', ora: '2026-10-28T10:00' });
  await nuovoAppuntamento(app.page, { titolo: 'Dentista', data: '2026-11-05', ora: '15:30', note: 'Portare la tessera' });
  await attendi(async () => assert.deepEqual(await titoli(areaInProgramma(app.page)), ['Dentista']));
  await app.ricarica();
  const voce = areaInProgramma(app.page).getByRole('listitem');
  assert.equal(await voce.count(), 1);
  const testo = await voce.textContent();
  assert.match(testo, /Dentista/);
  assert.match(testo, /giovedì 5 novembre 2026/);
  assert.match(testo, /15:30/);
  assert.match(testo, /Portare la tessera/);
  assert.deepEqual(app.richiesteEsterne, []);
});

test('gli appuntamenti sono in ordine cronologico; nello stesso giorno quelli senza ora vengono prima', async ({ apri }) => {
  const app = await apri({ percorso: '#/agenda', ora: '2026-10-28T10:00' });
  await nuovoAppuntamento(app.page, { titolo: 'Cena dai nonni', data: '2026-11-10', ora: '20:00' });
  await nuovoAppuntamento(app.page, { titolo: 'Pediatra', data: '2026-11-03', ora: '09:15' });
  await nuovoAppuntamento(app.page, { titolo: 'Compleanno Marta', data: '2026-11-03' });
  await nuovoAppuntamento(app.page, { titolo: 'Riunione scuola', data: '2026-11-03', ora: '08:30' });
  await nuovoAppuntamento(app.page, { titolo: 'Ferie', data: '2027-01-02' });
  const atteso = ['Compleanno Marta', 'Riunione scuola', 'Pediatra', 'Cena dai nonni', 'Ferie'];
  await attendi(async () => assert.deepEqual(await titoli(areaInProgramma(app.page)), atteso));
  await app.ricarica();
  assert.deepEqual(await titoli(areaInProgramma(app.page)), atteso);
});

test('un appuntamento si modifica e si elimina con conferma (annullando resta)', async ({ apri }) => {
  const app = await apri({ percorso: '#/agenda', ora: '2026-10-28T10:00' });
  await nuovoAppuntamento(app.page, { titolo: 'Meccanico', data: '2026-11-02', ora: '09:00' });
  await nuovoAppuntamento(app.page, { titolo: 'Palestra', data: '2026-11-04' });
  await app.page.getByRole('button', { name: 'Modifica Meccanico' }).click();
  const dialogo = app.page.getByRole('dialog', { name: 'Modifica appuntamento' });
  await dialogo.waitFor();
  assert.equal(await dialogo.getByLabel('Titolo').inputValue(), 'Meccanico');
  assert.equal(await dialogo.getByLabel('Data').inputValue(), '2026-11-02');
  assert.equal(await dialogo.getByLabel(/^Ora/).inputValue(), '09:00');
  await dialogo.getByLabel('Titolo').fill('Tagliando auto');
  await dialogo.getByLabel('Data').fill('2026-11-06');
  await dialogo.getByLabel(/^Ora/).fill('');
  await dialogo.getByRole('button', { name: 'Salva' }).click();
  await attendi(async () => assert.deepEqual(await titoli(areaInProgramma(app.page)), ['Palestra', 'Tagliando auto']));
  await app.ricarica();
  assert.deepEqual(await titoli(areaInProgramma(app.page)), ['Palestra', 'Tagliando auto']);
  assert.doesNotMatch(await areaInProgramma(app.page).textContent(), /09:00/);

  await app.page.getByRole('button', { name: 'Elimina Palestra' }).click();
  await app.page.getByRole('dialog').getByRole('button', { name: 'Annulla' }).click();
  await attendi(async () => assert.equal(await app.page.getByRole('dialog').count(), 0));
  assert.deepEqual(await titoli(areaInProgramma(app.page)), ['Palestra', 'Tagliando auto']);
  await app.page.getByRole('button', { name: 'Elimina Palestra' }).click();
  await app.page.getByRole('dialog').getByRole('button', { name: 'Elimina' }).click();
  await attendi(async () => assert.deepEqual(await titoli(areaInProgramma(app.page)), ['Tagliando auto']));
  await app.ricarica();
  assert.deepEqual(await titoli(areaInProgramma(app.page)), ['Tagliando auto']);
});

test('titolo e data sono obbligatori, l\'ora è facoltativa', async ({ apri }) => {
  const app = await apri({ percorso: '#/agenda', ora: '2026-10-28T10:00' });
  await app.page.getByRole('button', { name: 'Nuovo appuntamento' }).click();
  const dialogo = app.page.getByRole('dialog', { name: 'Nuovo appuntamento' });
  await dialogo.getByLabel('Data').fill('');
  await dialogo.getByRole('button', { name: 'Salva' }).click();
  assert.match(await dialogo.getByRole('alert').textContent(), /"Titolo" è obbligatorio/);
  await dialogo.getByLabel('Titolo').fill('Riunione');
  await dialogo.getByRole('button', { name: 'Salva' }).click();
  assert.match(await dialogo.getByRole('alert').textContent(), /"Data" è obbligatorio/);
  assert.equal(await dialogo.getByLabel('Ora (facoltativo)').count(), 1);
  await dialogo.getByLabel('Data').fill('2026-11-01');
  await dialogo.getByRole('button', { name: 'Salva' }).click();
  await attendi(async () => assert.deepEqual(await titoli(areaInProgramma(app.page)), ['Riunione']));
});

function voce(area, titolo) {
  return area.getByRole('listitem').filter({ has: area.page().locator('.appuntamento-titolo', { hasText: titolo }) });
}

async function etichetta(area, titolo) {
  const v = voce(area, titolo);
  return (await v.locator('.appuntamento-imminente').allTextContents()).join('');
}

function sezionePassati(page) { return page.getByRole('main').locator('details', { has: page.getByText(/^Passati/) }); }

test('oggi e domani sono imminenti; alle 23:59 si vede ancora quello delle 08:00 e alle 00:01 tutto cambia senza ricaricare', async ({ apri }) => {
  const app = await apri({ percorso: '#/agenda', ora: '2026-10-28T23:58:30' });
  await nuovoAppuntamento(app.page, { titolo: 'Riunione ieri', data: '2026-10-27', ora: '18:00' });
  await nuovoAppuntamento(app.page, { titolo: 'Colazione', data: '2026-10-28', ora: '08:00' });
  await nuovoAppuntamento(app.page, { titolo: 'Visita', data: '2026-10-29', ora: '10:00' });
  await nuovoAppuntamento(app.page, { titolo: 'Corso di yoga', data: '2026-10-30' });
  await app.avanzaOra(60000);
  await attendi(async () => assert.match(await app.page.getByRole('banner').textContent(), /23:59/));

  const prossimi = areaInProgramma(app.page);
  assert.deepEqual(await titoli(prossimi), ['Colazione', 'Visita', 'Corso di yoga']);
  assert.equal(await etichetta(prossimi, 'Colazione'), 'Oggi');
  assert.equal(await etichetta(prossimi, 'Visita'), 'Domani');
  assert.equal(await etichetta(prossimi, 'Corso di yoga'), '');
  const passati = sezionePassati(app.page);
  assert.equal(await passati.getAttribute('open'), null);
  assert.match(await passati.locator('summary').textContent(), /Passati \(1\)/);
  assert.equal(await voce(passati, 'Riunione ieri').isVisible(), false);
  await passati.locator('summary').click();
  assert.equal(await voce(passati, 'Riunione ieri').isVisible(), true);

  await app.avanzaOra(2 * 60000);
  await attendi(async () => assert.match(await app.page.getByRole('banner').textContent(), /00:01/));
  await attendi(async () => assert.deepEqual(await titoli(areaInProgramma(app.page)), ['Visita', 'Corso di yoga']));
  assert.equal(await etichetta(areaInProgramma(app.page), 'Visita'), 'Oggi');
  assert.equal(await etichetta(areaInProgramma(app.page), 'Corso di yoga'), 'Domani');
  assert.match(await sezionePassati(app.page).locator('summary').textContent(), /Passati \(2\)/);
  assert.deepEqual(await titoli(sezionePassati(app.page)), ['Colazione', 'Riunione ieri']);
});

test('la scheda Agenda mostra i prossimi 5 appuntamenti, senza i passati, e segue il cambio di giorno', async ({ apri }) => {
  const app = await apri({ percorso: '#/agenda', ora: '2026-10-28T23:58:30' });
  await nuovoAppuntamento(app.page, { titolo: 'Passato', data: '2026-10-20' });
  await nuovoAppuntamento(app.page, { titolo: 'Stasera', data: '2026-10-28', ora: '08:00' });
  for (let i = 1; i <= 6; i++) await nuovoAppuntamento(app.page, { titolo: 'Impegno ' + i, data: '2026-11-0' + i });
  await app.vai('#/');
  const scheda = schedaAgenda(app.page);
  await attendi(async () => assert.deepEqual(await titoli(scheda),
    ['Stasera', 'Impegno 1', 'Impegno 2', 'Impegno 3', 'Impegno 4']));
  assert.equal(await etichetta(scheda, 'Stasera'), 'Oggi');
  assert.equal(await scheda.getByRole('button').count(), 0);

  await app.avanzaOra(2 * 60000);
  await attendi(async () => assert.deepEqual(await titoli(schedaAgenda(app.page)),
    ['Impegno 1', 'Impegno 2', 'Impegno 3', 'Impegno 4', 'Impegno 5']));
  await schedaAgenda(app.page).getByRole('link', { name: 'Vedi tutti (6)' }).click();
  await app.attendiPronta();
  assert.match(app.page.url(), /#\/agenda$/);
});

test('un appuntamento creato a cavallo del cambio dell\'ora legale mantiene data e ora', async ({ apri }) => {
  const app = await apri({ percorso: '#/agenda', ora: '2026-03-29T01:59' });
  await nuovoAppuntamento(app.page, { titolo: 'Notte del cambio', data: '2026-03-29', ora: '02:30' });
  await nuovoAppuntamento(app.page, { titolo: 'Ritorno ora solare', data: '2026-10-25', ora: '02:30' });
  await app.avanzaOra(2 * 60000);
  await attendi(async () => assert.match(await app.page.getByRole('banner').textContent(), /03:01/));
  await app.ricarica();
  const prossimi = areaInProgramma(app.page);
  assert.deepEqual(await titoli(prossimi), ['Notte del cambio', 'Ritorno ora solare']);
  assert.match(await voce(prossimi, 'Notte del cambio').textContent(), /domenica 29 marzo 2026, 02:30/);
  assert.match(await voce(prossimi, 'Ritorno ora solare').textContent(), /domenica 25 ottobre 2026, 02:30/);
  assert.equal(await etichetta(prossimi, 'Notte del cambio'), 'Oggi');
  await app.page.getByRole('button', { name: 'Modifica Notte del cambio' }).click();
  const dialogo = app.page.getByRole('dialog', { name: 'Modifica appuntamento' });
  assert.equal(await dialogo.getByLabel('Data').inputValue(), '2026-03-29');
  assert.equal(await dialogo.getByLabel(/^Ora/).inputValue(), '02:30');
});

test('su smartphone l\'agenda non scorre in orizzontale anche con titoli lunghi', async ({ apri }) => {
  const app = await apri({ percorso: '#/agenda', viewport: 'smartphone', ora: '2026-10-28T10:00' });
  await nuovoAppuntamento(app.page, { titolo: 'Appuntamentolunghissimosenzaspazi'.repeat(4), data: '2026-10-28', ora: '18:00', note: 'x'.repeat(200) });
  await attendi(async () => assert.equal((await titoli(areaInProgramma(app.page))).length, 1));
  assert.ok(await app.overflowOrizzontale() <= 0);
});

test('titolo e note sono mostrati letteralmente e l\'agenda non fa chiamate di rete', async ({ apri }) => {
  // la dashboard contiene anche la scheda Meteo (#6): Open-Meteo risponde in finto, non è una richiesta esterna
  const app = await apri({ percorso: '#/agenda', ora: '2026-10-28T10:00', rete: [meteoFinto()] });
  const titolo = '<img src=x onerror="window.__xss=1">';
  await nuovoAppuntamento(app.page, { titolo, data: '2026-10-29', note: '<b>grassetto</b>' });
  await attendi(async () => assert.deepEqual(await titoli(areaInProgramma(app.page)), [titolo]));
  assert.match(await areaInProgramma(app.page).textContent(), /<b>grassetto<\/b>/);
  await app.vai('#/');
  await attendi(async () => assert.deepEqual(await titoli(schedaAgenda(app.page)), [titolo]));
  assert.equal(await app.page.evaluate(() => window.__xss), undefined);
  assert.equal(await app.page.locator('main img, main b').count(), 0);
  assert.deepEqual(app.richiesteEsterne, []);
});
