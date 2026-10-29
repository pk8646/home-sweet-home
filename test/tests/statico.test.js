'use strict';
const { test, assert } = require('../lib/test');
const statico = require('../lib/statico');

test('ogni script JS ha una sintassi valida', async ({ root }) => {
  const errori = statico.controllaSintassi(root);
  assert.deepEqual(errori, [], errori.map((e) => e.file + ': ' + e.errore).join('\n'));
});

test('ogni risorsa referenziata in index.html (e nel manifest) esiste con percorso relativo', async ({ root }) => {
  const problemi = statico.controllaRisorse(root);
  assert.deepEqual(problemi, [], problemi.map((p) => p.da + ' -> ' + p.url + ': ' + p.problema).join('\n'));
});

test('ogni file .js e .css del sito è caricato da index.html', async ({ root }) => {
  assert.deepEqual(statico.fileNonInclusi(root), []);
});

test('il sito è un repository git con remote origin e .gitignore per backup e archivi', async ({ root }) => {
  const { execFileSync } = require('child_process');
  const fs = require('fs');
  const path = require('path');
  const url = execFileSync('git', ['-C', root, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
  assert.equal(url, 'https://github.com/pk8646/home-sweet-home.git');
  const righe = fs.readFileSync(path.join(root, '.gitignore'), 'utf8').split(/\r?\n/).map((r) => r.trim());
  assert.ok(righe.includes('casa-nostra-backup-*.json'));
  assert.ok(righe.includes('*.zip'));
});

test('ogni risorsa caricata dalla pagina risponde sotto /home-sweet-home/', async ({ apri, sito }) => {
  const app = await apri({ attendiPronta: false });
  const falliti = [];
  app.page.on('requestfailed', (r) => falliti.push(r.url()));
  app.page.on('response', (r) => { if (r.status() >= 400) falliti.push(r.status() + ' ' + r.url()); });
  await app.ricarica();
  assert.deepEqual(falliti.filter((u) => u.includes(sito.origine)), []);
});
