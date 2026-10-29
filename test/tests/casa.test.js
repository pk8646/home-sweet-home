'use strict';
// Promemoria casa (ticket #5): pagina Casa e scheda della dashboard.
const { test, assert, attendi } = require('../lib/test');

const ORA = '2026-03-12T10:00'; // "oggi" = giovedì 12/03/2026

function areaDaFare(page) { return page.getByRole('region', { name: /^Da fare/ }); }
function areaCompletati(page) { return page.getByRole('region', { name: /^Completati/ }); }
function voce(radice, titolo) {
  const page = typeof radice.page === 'function' ? radice.page() : radice;
  return radice.getByRole('listitem').filter({ has: page.getByRole('heading', { name: titolo, exact: true }) });
}

async function titoli(area) {
  return (await area.getByRole('heading', { level: 4 }).allTextContents()).map((t) => t.trim());
}

async function compila(d, campi) {
  if (campi.titolo !== undefined) await d.getByLabel('Titolo', { exact: true }).fill(campi.titolo);
  if (campi.categoria) await d.getByLabel('Categoria', { exact: true }).selectOption({ label: campi.categoria });
  if (campi.data !== undefined) await d.getByLabel(/^Data/).fill(campi.data);
  if (campi.note !== undefined) await d.getByLabel(/^Note/).fill(campi.note);
  if (campi.intervallo !== undefined) await d.getByLabel(/^Ripeti ogni/).fill(String(campi.intervallo));
}

/** Crea un promemoria dalla pagina Casa. campi: { titolo, categoria, data, note, intervallo } */
async function crea(page, campi) {
  await page.getByRole('button', { name: 'Nuovo promemoria' }).click();
  const d = page.getByRole('dialog');
  await d.waitFor();
  await compila(d, campi);
  await d.getByRole('button', { name: 'Salva' }).click();
  await attendi(async () => assert.equal(await page.getByRole('dialog').count(), 0));
}

test('si crea un promemoria con tutti i campi e resta dopo il ricaricamento', async ({ apri }) => {
  const app = await apri({ percorso: '#/casa', ora: ORA });
  await crea(app.page, { titolo: 'Cambio filtro caldaia', categoria: 'Manutenzione', data: '2026-04-20', note: 'Filtro nel cassetto', intervallo: 90 });
  await app.ricarica();
  const v = voce(app.page, 'Cambio filtro caldaia');
  await attendi(async () => assert.equal(await v.count(), 1));
  const testo = await v.textContent();
  assert.match(testo, /Manutenzione/);
  assert.match(testo, /20\/04\/2026/);
  assert.match(testo, /Filtro nel cassetto/);
  assert.match(testo, /Ogni 90 giorni/);
});

test('l\'intervallo di ricorrenza accetta solo interi positivi', async ({ apri }) => {
  const app = await apri({ percorso: '#/casa', ora: ORA });
  await app.page.getByRole('button', { name: 'Nuovo promemoria' }).click();
  const d = app.page.getByRole('dialog');
  for (const sbagliato of ['0', '-3', '1.5']) {
    await compila(d, { titolo: 'Pulizia grondaie', intervallo: sbagliato });
    await d.getByRole('button', { name: 'Salva' }).click();
    await attendi(async () => assert.match(await d.getByRole('alert').textContent(), /intero/));
    assert.equal(await app.page.getByRole('dialog').count(), 1);
  }
  await compila(d, { intervallo: '30' });
  await d.getByRole('button', { name: 'Salva' }).click();
  await attendi(async () => assert.equal(await app.page.getByRole('dialog').count(), 0));
  assert.match(await voce(app.page, 'Pulizia grondaie').textContent(), /Ogni 30 giorni/);
});

test('si modifica un promemoria e si elimina con conferma', async ({ apri }) => {
  const app = await apri({ percorso: '#/casa', ora: ORA });
  await crea(app.page, { titolo: 'Bollo auto', categoria: 'Scadenza', data: '2026-05-31' });
  await app.page.getByRole('button', { name: 'Modifica Bollo auto' }).click();
  const d = app.page.getByRole('dialog');
  assert.equal(await d.getByLabel('Titolo', { exact: true }).inputValue(), 'Bollo auto');
  assert.equal(await d.getByLabel(/^Data/).inputValue(), '2026-05-31');
  await compila(d, { titolo: 'Bollo moto', categoria: 'Altro', data: '', note: 'Online', intervallo: 365 });
  await d.getByRole('button', { name: 'Salva' }).click();
  await app.ricarica();
  const v = voce(app.page, 'Bollo moto');
  await attendi(async () => assert.equal(await v.count(), 1));
  const testo = await v.textContent();
  assert.match(testo, /Altro/);
  assert.doesNotMatch(testo, /31\/05/);
  assert.match(testo, /Online/);
  assert.match(testo, /Ogni 365 giorni/);
  assert.equal(await voce(app.page, 'Bollo auto').count(), 0);

  await app.page.getByRole('button', { name: 'Elimina Bollo moto' }).click();
  await app.page.getByRole('dialog').getByRole('button', { name: 'Annulla' }).click();
  await attendi(async () => assert.equal(await app.page.getByRole('dialog').count(), 0));
  assert.equal(await voce(app.page, 'Bollo moto').count(), 1);
  await app.page.getByRole('button', { name: 'Elimina Bollo moto' }).click();
  await app.page.getByRole('dialog').getByRole('button', { name: 'Elimina' }).click();
  await attendi(async () => assert.equal(await voce(app.page, 'Bollo moto').count(), 0));
  await app.ricarica();
  assert.equal(await voce(app.page, 'Bollo moto').count(), 0);
});

test('completare un promemoria ogni 90 giorni previsto per il 10/03 lo porta all\'08/06 e mostra "Ultima volta: oggi"', async ({ apri }) => {
  const app = await apri({ percorso: '#/casa', ora: ORA });
  await crea(app.page, { titolo: 'Controllo estintore', categoria: 'Controllo periodico', data: '2026-03-10', intervallo: 90 });
  await app.page.getByRole('button', { name: 'Completa Controllo estintore' }).click();
  const v = voce(areaDaFare(app.page), 'Controllo estintore');
  await attendi(async () => assert.match(await v.textContent(), /08\/06\/2026/));
  assert.match(await v.textContent(), /Ultima volta: oggi/);
  await app.ricarica();
  const dopo = await voce(areaDaFare(app.page), 'Controllo estintore').textContent();
  assert.match(dopo, /08\/06\/2026/);
  assert.match(dopo, /Ultima volta: oggi/);
});

test('completare un promemoria ricorrente senza data imposta la data a oggi + intervallo', async ({ apri }) => {
  const app = await apri({ percorso: '#/casa', ora: ORA });
  await crea(app.page, { titolo: 'Pulizia condizionatore', intervallo: 30 });
  await app.page.getByRole('button', { name: 'Completa Pulizia condizionatore' }).click();
  // 12/03/2026 + 30 giorni = 11/04/2026
  await attendi(async () => assert.match(await voce(areaDaFare(app.page), 'Pulizia condizionatore').textContent(), /11\/04\/2026/));
});

test('un promemoria non ricorrente completato appare come completato e si può riaprire', async ({ apri }) => {
  const app = await apri({ percorso: '#/casa', ora: ORA });
  await crea(app.page, { titolo: 'Rinnovo assicurazione casa', categoria: 'Scadenza', data: '2026-03-20' });
  await app.page.getByRole('button', { name: 'Completa Rinnovo assicurazione casa' }).click();
  await attendi(async () => assert.deepEqual(await titoli(areaCompletati(app.page)), ['Rinnovo assicurazione casa']));
  assert.deepEqual(await titoli(areaDaFare(app.page)), []);
  await app.ricarica();
  const v = voce(areaCompletati(app.page), 'Rinnovo assicurazione casa');
  assert.match(await v.textContent(), /Completato/);
  assert.match(await v.textContent(), /20\/03\/2026/);
  await app.page.getByRole('button', { name: 'Riapri Rinnovo assicurazione casa' }).click();
  await attendi(async () => assert.deepEqual(await titoli(areaDaFare(app.page)), ['Rinnovo assicurazione casa']));
  assert.deepEqual(await titoli(areaCompletati(app.page)), []);
  await app.ricarica();
  assert.deepEqual(await titoli(areaDaFare(app.page)), ['Rinnovo assicurazione casa']);
});

test('la pagina ordina per data, evidenzia gli scaduti e mette in fondo quelli senza data', async ({ apri }) => {
  const app = await apri({ percorso: '#/casa', ora: ORA });
  await crea(app.page, { titolo: 'Revisione caldaia', data: '2026-04-01' });
  await crea(app.page, { titolo: 'Sistemare la mensola' });
  await crea(app.page, { titolo: 'Pagare TARI', categoria: 'Scadenza', data: '2026-03-01' });
  await crea(app.page, { titolo: 'Lettura contatore', data: '2026-03-12' });
  await crea(app.page, { titolo: 'Vecchia bolletta', data: '2026-02-01' });
  await app.page.getByRole('button', { name: 'Completa Vecchia bolletta' }).click();
  await attendi(async () => assert.deepEqual(await titoli(areaCompletati(app.page)), ['Vecchia bolletta']));
  await app.ricarica();
  assert.deepEqual(await titoli(areaDaFare(app.page)), ['Pagare TARI', 'Lettura contatore', 'Revisione caldaia', 'Sistemare la mensola']);
  const tari = voce(app.page, 'Pagare TARI');
  assert.match(await tari.textContent(), /Scaduto/);
  assert.match(await tari.getAttribute('class'), /scadut/);
  for (const t of ['Lettura contatore', 'Revisione caldaia', 'Sistemare la mensola', 'Vecchia bolletta']) {
    assert.doesNotMatch(await voce(app.page, t).textContent(), /Scaduto/, t);
  }
});

test('il filtro per categoria mostra solo i promemoria della categoria scelta', async ({ apri }) => {
  const app = await apri({ percorso: '#/casa', ora: ORA });
  await crea(app.page, { titolo: 'Olio cardini', categoria: 'Manutenzione', data: '2026-03-20' });
  await crea(app.page, { titolo: 'Canone TV', categoria: 'Scadenza', data: '2026-03-25' });
  await crea(app.page, { titolo: 'Pressione caldaia', categoria: 'Controllo periodico' });
  await crea(app.page, { titolo: 'Chiave di scorta', categoria: 'Altro' });
  const filtro = app.page.getByLabel('Filtra per categoria');
  await filtro.selectOption({ label: 'Scadenza' });
  await attendi(async () => assert.deepEqual(await titoli(areaDaFare(app.page)), ['Canone TV']));
  await filtro.selectOption({ label: 'Controllo periodico' });
  await attendi(async () => assert.deepEqual(await titoli(areaDaFare(app.page)), ['Pressione caldaia']));
  // Il filtro resta attivo dopo un'azione sulla lista.
  await app.page.getByRole('button', { name: 'Completa Pressione caldaia' }).click();
  await attendi(async () => assert.deepEqual(await titoli(areaCompletati(app.page)), ['Pressione caldaia']));
  assert.deepEqual(await titoli(areaDaFare(app.page)), []);
  await filtro.selectOption({ label: 'Tutte' });
  await attendi(async () => assert.deepEqual(await titoli(areaDaFare(app.page)), ['Olio cardini', 'Canone TV', 'Chiave di scorta']));
});

test('su smartphone la pagina Casa non scorre in orizzontale anche con titoli lunghi', async ({ apri }) => {
  const app = await apri({ percorso: '#/casa', ora: ORA, viewport: 'smartphone' });
  await crea(app.page, { titolo: 'Sostituzione' + 'guarnizione'.repeat(8), data: '2026-03-01', note: 'x'.repeat(200), intervallo: 180 });
  assert.ok(await app.overflowOrizzontale() <= 0, 'la pagina scorre in orizzontale');
});

function schedaCasa(page) { return page.getByRole('region', { name: 'Casa' }); }

test('la scheda Casa mostra al massimo 5 promemoria da fare, in ordine, e il link "Vedi tutti (N)"', async ({ apri }) => {
  const app = await apri({ percorso: '#/casa', ora: ORA });
  const giorni = ['2026-03-20', '2026-03-05', '2026-03-28', '2026-03-15', '2026-04-02', '2026-03-18'];
  for (let i = 0; i < giorni.length; i++) await crea(app.page, { titolo: 'Promemoria ' + (i + 1), data: giorni[i] });
  await crea(app.page, { titolo: 'Senza data' });
  await crea(app.page, { titolo: 'Già fatto', data: '2026-03-01' });
  await app.page.getByRole('button', { name: 'Completa Già fatto' }).click();
  await attendi(async () => assert.deepEqual(await titoli(areaCompletati(app.page)), ['Già fatto']));

  await app.vai('#/');
  const scheda = schedaCasa(app.page);
  await attendi(async () => assert.equal(await scheda.getByRole('listitem').count(), 5));
  assert.deepEqual(await titoli(scheda), ['Promemoria 2', 'Promemoria 4', 'Promemoria 6', 'Promemoria 1', 'Promemoria 3']);
  assert.match(await voce(scheda, 'Promemoria 2').textContent(), /Scaduto/);
  await scheda.getByRole('link', { name: 'Vedi tutti (7)' }).click();
  await app.attendiPronta();
  assert.match(app.page.url(), /#\/casa$/);
});

test('la scheda Casa vuota lo dice, e nell\'interfaccia non si parla mai di notifiche', async ({ apri }) => {
  const app = await apri({ ora: ORA });
  const scheda = schedaCasa(app.page);
  await attendi(async () => assert.match(await scheda.textContent(), /Nessun promemoria/));
  assert.doesNotMatch(await app.page.locator('body').innerText(), /notific|avvis(o|erò|eremo) (quando|alla)/i);
  await app.vai('#/casa');
  await app.page.getByRole('button', { name: 'Nuovo promemoria' }).click();
  await app.page.getByRole('dialog').waitFor();
  assert.doesNotMatch(await app.page.locator('body').innerText(), /notific/i);
});
