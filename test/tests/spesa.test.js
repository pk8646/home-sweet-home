'use strict';
// Lista della spesa (ticket #2): pagina Spesa e scheda della dashboard.
const { test, assert, attendi } = require('../lib/test');

function areaDaComprare(page) { return page.getByRole('region', { name: /^Da comprare/ }); }
function areaAcquistati(page) { return page.getByRole('region', { name: /^Acquistati/ }); }

async function nomi(area) {
  return (await area.getByRole('listitem').allTextContents()).map((t) => t.trim());
}

async function aggiungiDallaPagina(page, nome) {
  await page.getByLabel('Prodotto da aggiungere').fill(nome);
  await page.getByRole('button', { name: 'Aggiungi', exact: true }).click();
}

test('dalla pagina Spesa si aggiunge un prodotto che resta dopo il ricaricamento', async ({ apri }) => {
  const app = await apri({ percorso: '#/spesa' });
  await aggiungiDallaPagina(app.page, 'Latte x2');
  await attendi(async () => assert.deepEqual(await nomi(areaDaComprare(app.page)), ['Latte x2']));
  await app.ricarica();
  await attendi(async () => assert.deepEqual(await nomi(areaDaComprare(app.page)), ['Latte x2']));
});

function schedaSpesa(page) { return page.getByRole('region', { name: 'Spesa' }); }

test('dalla scheda della dashboard si aggiunge un prodotto che resta dopo il ricaricamento', async ({ apri }) => {
  const app = await apri();
  const scheda = schedaSpesa(app.page);
  await scheda.getByLabel('Prodotto da aggiungere').fill('Pane');
  await scheda.getByLabel('Prodotto da aggiungere').press('Enter');
  await attendi(async () => assert.deepEqual(await nomi(scheda), ['Pane']));
  await app.ricarica();
  await attendi(async () => assert.deepEqual(await nomi(schedaSpesa(app.page)), ['Pane']));
  await app.vai('#/spesa');
  assert.deepEqual(await nomi(areaDaComprare(app.page)), ['Pane']);
});

test('un tocco segna un prodotto come acquistato e un altro lo riporta da comprare', async ({ apri }) => {
  const app = await apri({ percorso: '#/spesa' });
  await aggiungiDallaPagina(app.page, 'Uova');
  await aggiungiDallaPagina(app.page, 'Burro');
  await areaDaComprare(app.page).getByRole('checkbox', { name: 'Uova' }).click();
  await attendi(async () => {
    assert.deepEqual(await nomi(areaDaComprare(app.page)), ['Burro']);
    assert.deepEqual(await nomi(areaAcquistati(app.page)), ['Uova']);
  });
  await app.ricarica();
  assert.deepEqual(await nomi(areaAcquistati(app.page)), ['Uova']);
  await areaAcquistati(app.page).getByRole('checkbox', { name: 'Uova' }).click();
  await attendi(async () => {
    assert.deepEqual((await nomi(areaDaComprare(app.page))).sort(), ['Burro', 'Uova']);
    assert.deepEqual(await nomi(areaAcquistati(app.page)), []);
  });
});

test('"Latte" con " latte " già da comprare mostra un avviso e non crea doppioni', async ({ apri }) => {
  const app = await apri({ percorso: '#/spesa' });
  await aggiungiDallaPagina(app.page, ' latte ');
  await attendi(async () => assert.deepEqual(await nomi(areaDaComprare(app.page)), ['latte']));
  await aggiungiDallaPagina(app.page, 'Latte');
  await attendi(async () => assert.match(await app.page.getByRole('status').last().textContent(), /già nella lista da comprare/));
  assert.deepEqual(await nomi(areaDaComprare(app.page)), ['latte']);
  await aggiungiDallaPagina(app.page, 'LATTE   ');
  await app.ricarica();
  assert.deepEqual(await nomi(areaDaComprare(app.page)), ['latte']);
});

test('riaggiungere un prodotto già acquistato lo riporta da comprare', async ({ apri }) => {
  const app = await apri({ percorso: '#/spesa' });
  await aggiungiDallaPagina(app.page, ' latte ');
  await areaDaComprare(app.page).getByRole('checkbox', { name: 'latte' }).click();
  await attendi(async () => assert.deepEqual(await nomi(areaAcquistati(app.page)), ['latte']));
  await aggiungiDallaPagina(app.page, 'Latte');
  await attendi(async () => {
    assert.deepEqual(await nomi(areaDaComprare(app.page)), ['latte']);
    assert.deepEqual(await nomi(areaAcquistati(app.page)), []);
  });
});

test('si elimina un singolo prodotto', async ({ apri }) => {
  const app = await apri({ percorso: '#/spesa' });
  await aggiungiDallaPagina(app.page, 'Mele');
  await aggiungiDallaPagina(app.page, 'Pere');
  await app.page.getByRole('button', { name: 'Elimina Mele' }).click();
  await attendi(async () => assert.deepEqual(await nomi(areaDaComprare(app.page)), ['Pere']));
  await app.ricarica();
  assert.deepEqual(await nomi(areaDaComprare(app.page)), ['Pere']);
});

async function preparaLista(app) {
  for (const n of ['Mele', 'Pere', 'Riso']) await aggiungiDallaPagina(app.page, n);
  await attendi(async () => assert.equal((await nomi(areaDaComprare(app.page))).length, 3));
  await areaDaComprare(app.page).getByRole('checkbox', { name: 'Pere' }).click();
  await attendi(async () => assert.deepEqual(await nomi(areaAcquistati(app.page)), ['Pere']));
}

test('"Rimuovi acquistati" chiede conferma: annullando non cambia nulla, confermando toglie gli acquistati', async ({ apri }) => {
  const app = await apri({ percorso: '#/spesa' });
  await preparaLista(app);
  await app.page.getByRole('button', { name: 'Rimuovi acquistati' }).click();
  const dialogo = app.page.getByRole('dialog');
  await dialogo.waitFor();
  await dialogo.getByRole('button', { name: 'Annulla' }).click();
  await attendi(async () => assert.equal(await app.page.getByRole('dialog').count(), 0));
  assert.deepEqual(await nomi(areaAcquistati(app.page)), ['Pere']);
  assert.deepEqual(await nomi(areaDaComprare(app.page)), ['Mele', 'Riso']);

  await app.page.getByRole('button', { name: 'Rimuovi acquistati' }).click();
  await app.page.getByRole('dialog').getByRole('button', { name: 'Rimuovi' }).click();
  await attendi(async () => assert.deepEqual(await nomi(areaAcquistati(app.page)), []));
  assert.deepEqual(await nomi(areaDaComprare(app.page)), ['Mele', 'Riso']);
});

test('"Svuota tutto" chiede conferma: Esc annulla, confermando svuota la lista', async ({ apri }) => {
  const app = await apri({ percorso: '#/spesa' });
  await preparaLista(app);
  await app.page.getByRole('button', { name: 'Svuota tutto' }).click();
  await app.page.getByRole('dialog').waitFor();
  await app.page.keyboard.press('Escape');
  await attendi(async () => assert.equal(await app.page.getByRole('dialog').count(), 0));
  assert.equal((await nomi(areaDaComprare(app.page))).length, 2);
  assert.equal((await nomi(areaAcquistati(app.page))).length, 1);

  await app.page.getByRole('button', { name: 'Svuota tutto' }).click();
  await app.page.getByRole('dialog').getByRole('button', { name: 'Svuota' }).click();
  await attendi(async () => {
    assert.deepEqual(await nomi(areaDaComprare(app.page)), []);
    assert.deepEqual(await nomi(areaAcquistati(app.page)), []);
  });
  await app.ricarica();
  assert.deepEqual(await nomi(areaDaComprare(app.page)), []);
});

test('la scheda Spesa mostra al massimo 5 prodotti e il link "Vedi tutti (N)"', async ({ apri }) => {
  const app = await apri({ percorso: '#/spesa' });
  for (let i = 1; i <= 7; i++) await aggiungiDallaPagina(app.page, 'Prodotto ' + i);
  await attendi(async () => assert.equal((await nomi(areaDaComprare(app.page))).length, 7));
  await app.vai('#/');
  const scheda = schedaSpesa(app.page);
  await attendi(async () => assert.equal(await scheda.getByRole('listitem').count(), 5));
  await scheda.getByRole('link', { name: 'Vedi tutti (7)' }).click();
  await app.attendiPronta();
  assert.match(app.page.url(), /#\/spesa$/);
});

test('dalla scheda un tocco segna il prodotto come acquistato', async ({ apri }) => {
  const app = await apri();
  const scheda = schedaSpesa(app.page);
  await scheda.getByLabel('Prodotto da aggiungere').fill('Caffè');
  await scheda.getByRole('button', { name: 'Aggiungi' }).click();
  await scheda.getByRole('checkbox', { name: 'Caffè' }).click();
  await attendi(async () => assert.deepEqual(await nomi(scheda), []));
  await scheda.getByRole('link', { name: 'Vedi tutti (0)' }).waitFor();
  await app.vai('#/spesa');
  assert.deepEqual(await nomi(areaAcquistati(app.page)), ['Caffè']);
});

test('il nome di un prodotto viene mostrato letteralmente, senza interpretare HTML', async ({ apri }) => {
  const app = await apri({ percorso: '#/spesa' });
  const nome = '<img src=x onerror="window.__xss=1">';
  await aggiungiDallaPagina(app.page, nome);
  await attendi(async () => assert.deepEqual(await nomi(areaDaComprare(app.page)), [nome]));
  await app.vai('#/');
  await attendi(async () => assert.deepEqual(await nomi(schedaSpesa(app.page)), [nome]));
  assert.equal(await app.page.evaluate(() => window.__xss), undefined);
  assert.equal(await app.page.locator('main img').count(), 0);
});
