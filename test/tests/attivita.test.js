'use strict';
// Attività (ticket #3): pagina Attività e scheda della dashboard.
const { test, assert, attendi } = require('../lib/test');

function elencoAttivita(page) { return page.getByRole('list', { name: 'Elenco attività' }); }

async function titoli(page) {
  return (await elencoAttivita(page).locator('.attivita-titolo').allTextContents()).map((t) => t.trim());
}

async function aggiungi(page, titolo, nota) {
  await page.getByLabel('Nuova attività', { exact: true }).fill(titolo);
  if (nota !== undefined) await page.getByLabel(/^Nota/).fill(nota);
  await page.getByRole('button', { name: 'Aggiungi', exact: true }).click();
}

test('si aggiunge un\'attività con titolo e nota che resta dopo il ricaricamento', async ({ apri }) => {
  const app = await apri({ percorso: '#/attivita' });
  await aggiungi(app.page, 'Chiamare l\'idraulico', 'Dopo le 17');
  await attendi(async () => assert.deepEqual(await titoli(app.page), ['Chiamare l\'idraulico']));
  await app.ricarica();
  await attendi(async () => assert.deepEqual(await titoli(app.page), ['Chiamare l\'idraulico']));
  assert.match(await elencoAttivita(app.page).getByRole('listitem').first().textContent(), /Dopo le 17/);
});

test('un titolo vuoto viene rifiutato con un messaggio e non crea attività', async ({ apri }) => {
  const app = await apri({ percorso: '#/attivita' });
  await aggiungi(app.page, '   ', 'Solo nota');
  await attendi(async () => assert.match(await app.page.getByRole('alert').first().textContent(), /titolo/i));
  assert.deepEqual(await titoli(app.page), []);
  assert.equal(await app.page.getByLabel(/^Nota/).inputValue(), 'Solo nota');
  await app.ricarica();
  assert.deepEqual(await titoli(app.page), []);
});

async function filtro(page, nome) {
  const pulsante = page.getByRole('group', { name: 'Filtro attività' }).getByRole('button', { name: nome, exact: true });
  await pulsante.click();
  await attendi(async () => assert.equal(await pulsante.getAttribute('aria-pressed'), 'true'));
}

function casella(page, titolo) { return elencoAttivita(page).getByRole('checkbox', { name: titolo }); }

/**
 * Tocca la casella e aspetta che l'elenco sia ridisegnato: la casella cambia stato da sola al tocco, ma il
 * salvataggio finisce dopo; ricaricare prima vorrebbe dire perdere un tocco che l'app non ha ancora scritto.
 */
async function tocca(page, titolo) {
  const vecchia = await casella(page, titolo).elementHandle();
  await casella(page, titolo).click();
  await attendi(async () => assert.equal(await vecchia.evaluate((el) => el.isConnected), false));
}

test('un tocco completa un\'attività e un altro la riapre, anche dopo il ricaricamento', async ({ apri }) => {
  const app = await apri({ percorso: '#/attivita' });
  await aggiungi(app.page, 'Stirare');
  await filtro(app.page, 'Tutte');
  await attendi(async () => assert.deepEqual(await titoli(app.page), ['Stirare']));
  assert.equal(await casella(app.page, 'Stirare').isChecked(), false);
  await tocca(app.page, 'Stirare');
  await attendi(async () => assert.equal(await casella(app.page, 'Stirare').isChecked(), true));
  await app.ricarica();
  await filtro(app.page, 'Tutte');
  await attendi(async () => assert.equal(await casella(app.page, 'Stirare').isChecked(), true));
  await tocca(app.page, 'Stirare');
  await attendi(async () => assert.equal(await casella(app.page, 'Stirare').isChecked(), false));
  await app.ricarica();
  await filtro(app.page, 'Tutte');
  await attendi(async () => assert.equal(await casella(app.page, 'Stirare').isChecked(), false));
});

test('i filtri Da fare / Completate / Tutte mostrano gli insiemi giusti', async ({ apri }) => {
  const app = await apri({ percorso: '#/attivita' });
  for (const t of ['Lavatrice', 'Bollette', 'Potare le rose']) await aggiungi(app.page, t);
  await attendi(async () => assert.equal((await titoli(app.page)).length, 3));
  // Il filtro predefinito è "Da fare".
  assert.equal(await app.page.getByRole('button', { name: 'Da fare', exact: true }).getAttribute('aria-pressed'), 'true');
  await casella(app.page, 'Bollette').click();
  await attendi(async () => assert.deepEqual(await titoli(app.page), ['Lavatrice', 'Potare le rose']));
  await filtro(app.page, 'Completate');
  await attendi(async () => assert.deepEqual(await titoli(app.page), ['Bollette']));
  await filtro(app.page, 'Tutte');
  await attendi(async () => assert.deepEqual((await titoli(app.page)).sort(), ['Bollette', 'Lavatrice', 'Potare le rose']));
  await filtro(app.page, 'Da fare');
  await attendi(async () => assert.deepEqual(await titoli(app.page), ['Lavatrice', 'Potare le rose']));
  for (const t of ['Lavatrice', 'Potare le rose']) await casella(app.page, t).click();
  await attendi(async () => assert.deepEqual(await titoli(app.page), []));
  assert.match(await app.page.locator('main').textContent(), /Nessuna attività da fare/);
});

test('si modificano titolo e nota da un dialogo; un titolo vuoto è rifiutato', async ({ apri }) => {
  const app = await apri({ percorso: '#/attivita' });
  await aggiungi(app.page, 'Lavare l\'auto', 'Sabato');
  await attendi(async () => assert.deepEqual(await titoli(app.page), ['Lavare l\'auto']));
  await app.page.getByRole('button', { name: 'Modifica Lavare l\'auto' }).click();
  const dialogo = app.page.getByRole('dialog');
  await dialogo.waitFor();
  assert.equal(await dialogo.getByLabel('Titolo', { exact: true }).inputValue(), 'Lavare l\'auto');
  assert.equal(await dialogo.getByLabel(/^Nota/).inputValue(), 'Sabato');
  await dialogo.getByLabel('Titolo', { exact: true }).fill('   ');
  await dialogo.getByRole('button', { name: 'Salva' }).click();
  await attendi(async () => assert.match(await dialogo.getByRole('alert').textContent(), /obbligatorio/));
  await dialogo.getByLabel('Titolo', { exact: true }).fill('Lavare la moto');
  await dialogo.getByLabel(/^Nota/).fill('Domenica mattina');
  await dialogo.getByRole('button', { name: 'Salva' }).click();
  await attendi(async () => assert.equal(await app.page.getByRole('dialog').count(), 0));
  await attendi(async () => assert.deepEqual(await titoli(app.page), ['Lavare la moto']));
  await app.ricarica();
  assert.deepEqual(await titoli(app.page), ['Lavare la moto']);
  assert.match(await elencoAttivita(app.page).getByRole('listitem').first().textContent(), /Domenica mattina/);
  assert.doesNotMatch(await elencoAttivita(app.page).getByRole('listitem').first().textContent(), /Sabato/);
});

test('l\'eliminazione chiede conferma: annullando resta, confermando sparisce', async ({ apri }) => {
  const app = await apri({ percorso: '#/attivita' });
  await aggiungi(app.page, 'Pulire i vetri');
  await aggiungi(app.page, 'Comprare lampadine');
  await attendi(async () => assert.equal((await titoli(app.page)).length, 2));
  await app.page.getByRole('button', { name: 'Elimina Pulire i vetri' }).click();
  await app.page.getByRole('dialog').waitFor();
  await app.page.getByRole('dialog').getByRole('button', { name: 'Annulla' }).click();
  await attendi(async () => assert.equal(await app.page.getByRole('dialog').count(), 0));
  assert.deepEqual(await titoli(app.page), ['Pulire i vetri', 'Comprare lampadine']);

  await app.page.getByRole('button', { name: 'Elimina Pulire i vetri' }).click();
  await app.page.getByRole('dialog').getByRole('button', { name: 'Elimina' }).click();
  await attendi(async () => assert.deepEqual(await titoli(app.page), ['Comprare lampadine']));
  await app.ricarica();
  assert.deepEqual(await titoli(app.page), ['Comprare lampadine']);
});

function schedaAttivita(page) { return page.getByRole('region', { name: 'Attività' }); }

test('la scheda della dashboard mostra solo le attività da fare (massimo 5) e il link "Vedi tutte"', async ({ apri }) => {
  const app = await apri({ percorso: '#/attivita' });
  for (let i = 1; i <= 7; i++) await aggiungi(app.page, 'Attività ' + i);
  await attendi(async () => assert.equal((await titoli(app.page)).length, 7));
  await casella(app.page, 'Attività 2').click();
  await attendi(async () => assert.equal((await titoli(app.page)).length, 6));
  await app.vai('#/');
  const scheda = schedaAttivita(app.page);
  await attendi(async () => assert.deepEqual(
    (await scheda.locator('.attivita-titolo').allTextContents()).map((t) => t.trim()),
    ['Attività 1', 'Attività 3', 'Attività 4', 'Attività 5', 'Attività 6']));
  await scheda.getByRole('link', { name: 'Vedi tutte (6)' }).click();
  await app.attendiPronta();
  assert.match(app.page.url(), /#\/attivita$/);
});

test('dalla scheda un tocco completa l\'attività, che sparisce dalla scheda', async ({ apri }) => {
  const app = await apri({ percorso: '#/attivita' });
  await aggiungi(app.page, 'Annaffiare');
  await aggiungi(app.page, 'Spolverare');
  await attendi(async () => assert.equal((await titoli(app.page)).length, 2));
  await app.vai('#/');
  const scheda = schedaAttivita(app.page);
  await scheda.getByRole('checkbox', { name: 'Annaffiare' }).click();
  await attendi(async () => assert.deepEqual(
    (await scheda.locator('.attivita-titolo').allTextContents()).map((t) => t.trim()), ['Spolverare']));
  await app.vai('#/attivita');
  await filtro(app.page, 'Completate');
  await attendi(async () => assert.deepEqual(await titoli(app.page), ['Annaffiare']));
});

test('su smartphone la pagina non scorre in orizzontale anche con titoli lunghi', async ({ apri }) => {
  const app = await apri({ percorso: '#/attivita', viewport: 'smartphone' });
  await aggiungi(app.page, 'Supercalifragilistichespiralidoso'.repeat(3), 'Nota '.repeat(30));
  await attendi(async () => assert.equal((await titoli(app.page)).length, 1));
  assert.equal(await app.overflowOrizzontale(), 0);
});

test('senza attività da fare la scheda lo dice', async ({ apri }) => {
  const app = await apri();
  await attendi(async () => assert.match(await schedaAttivita(app.page).textContent(), /Nessuna attività da fare/));
});
