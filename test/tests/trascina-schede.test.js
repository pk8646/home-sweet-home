'use strict';
// Trascinamento delle schede della dashboard col mouse (ticket #20, spec #18).
const { test, assert, attendi } = require('../lib/test');
const { conDatiIniziali } = require('../lib/benvenuto');
const { meteoFinto } = require('../lib/meteo-finto');

const ORA = '2026-05-12T10:00';

function conImpostazioni(campi) {
  return conDatiIniziali({ impostazioni: [Object.assign({ id: 'impostazioni', benvenutoVisto: true }, campi)] });
}

function apriDashboard(apri, opzioni) {
  return apri(Object.assign({ ora: ORA, oraFissa: true, rete: [meteoFinto()], scriptIniziale: conImpostazioni({}) }, opzioni));
}

/** Gli id dei figli della griglia (schede e segnaposto), dall'alto in basso. */
function figliGriglia(page) {
  return page.locator('.dashboard-griglia > *').evaluateAll((s) => s.map((n) => n.getAttribute('data-scheda') || n.className));
}

function schedeDashboard(page) {
  return page.locator('.dashboard-griglia > section[data-scheda]').evaluateAll((s) => s.map((n) => n.getAttribute('data-scheda')));
}

function scheda(page, id) { return page.locator('.dashboard-griglia > section[data-scheda="' + id + '"]'); }

/** Un punto dentro la parte visibile del riquadro (centro dell'intersezione con la finestra). */
async function puntoIn(locator) {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const alto = Math.max(r.top, 0);
    const basso = Math.min(r.bottom, window.innerHeight);
    return { x: r.left + r.width / 2, y: (alto + basso) / 2 };
  });
}

/** Preme il mouse sul titolo della scheda (lo porta prima nella finestra). */
async function premiTitolo(app, id) {
  const titolo = scheda(app.page, id).locator('.scheda-titolo');
  // al centro della finestra: non sotto la barra di navigazione fissa o un toast
  await titolo.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const b = await titolo.boundingBox();
  const p = { x: b.x + 20, y: b.y + b.height / 2 };
  await app.page.mouse.move(p.x, p.y);
  await app.page.mouse.down();
  return p;
}

/**
 * Tiene premuto il titolo di `id` per 400 ms e porta il puntatore sopra la scheda `su` (senza rilasciare).
 * Un solo passo: un percorso a più passi può attraversare altre schede (su più colonne dipende dal viewport)
 * e ogni scheda attraversata sposta il segnaposto.
 */
async function afferraEPorta(app, id, su) {
  await premiTitolo(app, id);
  await app.avanzaOra(450);
  const p = await puntoIn(scheda(app.page, su));
  await app.page.mouse.move(p.x, p.y);
  return p;
}

/** Aspetta che i salvataggi delle impostazioni già in coda siano finiti (leggi() attende la coda). */
function salvataggiFiniti(app) {
  return app.page.evaluate(() => CasaNostra.impostazioni.leggi().then(() => undefined));
}

test('tenere premuto il titolo e trascinare la scheda cambia l\'ordine, che resta dopo una ricarica e compare nelle Impostazioni', async ({ apri }) => {
  const app = await apriDashboard(apri);
  assert.deepEqual(await schedeDashboard(app.page), ['meteo', 'agenda', 'attivita', 'spesa', 'casa', 'foto']);
  await afferraEPorta(app, 'agenda', 'meteo');
  await app.page.mouse.up();
  const atteso = ['agenda', 'meteo', 'attivita', 'spesa', 'casa', 'foto'];
  assert.deepEqual(await schedeDashboard(app.page), atteso);
  await salvataggiFiniti(app);
  await app.ricarica();
  assert.deepEqual(await schedeDashboard(app.page), atteso);
  await app.vai('#/impostazioni');
  const gruppo = app.page.getByRole('region', { name: 'Schede della dashboard' });
  assert.equal(await gruppo.getByRole('button', { name: 'Sposta Agenda su' }).isDisabled(), true);
  assert.equal(await gruppo.getByRole('button', { name: 'Sposta Meteo su' }).isDisabled(), false);
});

/** I nomi delle schede elencate nel gruppo "Schede della dashboard" delle Impostazioni, dall'alto in basso. */
function righeImpostazioni(page) {
  return page.getByRole('region', { name: 'Schede della dashboard' }).getByRole('checkbox').evaluateAll((caselle) => caselle.map((c) => c.id.replace('impostazioni-scheda-', '')));
}

function contaSegnaposto(page) { return page.locator('.scheda-segnaposto').count(); }

test('le schede spostabili hanno l\'indicatore ⠿ decorativo accanto al titolo, le schede fisse no', async ({ apri }) => {
  const app = await apriDashboard(apri, { scriptIniziale: conImpostazioni({ benvenutoVisto: false }) });
  await app.page.getByRole('region', { name: 'Benvenuti' }).waitFor();
  const maniglie = await app.page.locator('.dashboard-griglia > section[data-scheda]').evaluateAll((s) => s.map((n) => {
    const m = Array.prototype.filter.call(n.querySelectorAll('h2 *'), (e) => e.textContent === '⠿');
    return n.getAttribute('data-scheda') + ':' + m.map((e) => e.getAttribute('aria-hidden')).join();
  }));
  assert.deepEqual(maniglie, ['benvenuto:', 'meteo:true', 'agenda:true', 'attivita:true', 'spesa:true', 'casa:true', 'foto:true']);
  // L'indicatore non entra nel nome accessibile della scheda.
  assert.equal(await app.page.getByRole('region', { name: 'Agenda', exact: true }).count(), 1);
});

test('una pressione breve, o un movimento oltre la soglia prima dei 400 ms, non avviano il trascinamento', async ({ apri }) => {
  const app = await apriDashboard(apri);
  const prima = await schedeDashboard(app.page);

  // pressione breve
  await premiTitolo(app, 'agenda');
  await app.avanzaOra(300);
  await app.page.mouse.up();
  await app.avanzaOra(500);
  assert.equal(await contaSegnaposto(app.page), 0);

  // movimento di 20 px prima dei 400 ms: poi la pressione prolungata non solleva più la scheda
  const p = await premiTitolo(app, 'agenda');
  await app.avanzaOra(200);
  await app.page.mouse.move(p.x, p.y + 20, { steps: 4 });
  await app.avanzaOra(500);
  assert.equal(await contaSegnaposto(app.page), 0);
  const su = await puntoIn(scheda(app.page, 'meteo'));
  await app.page.mouse.move(su.x, su.y);
  await app.page.mouse.up();
  assert.deepEqual(await schedeDashboard(app.page), prima);

  // un movimento piccolo (entro la soglia) non impedisce il trascinamento
  const q = await premiTitolo(app, 'agenda');
  await app.page.mouse.move(q.x + 5, q.y + 5);
  await app.avanzaOra(450);
  assert.equal(await contaSegnaposto(app.page), 1);
  await app.page.keyboard.press('Escape');
  await app.page.mouse.up();
});

test('la pressione prolungata sul corpo di una scheda non avvia il trascinamento', async ({ apri }) => {
  const app = await apriDashboard(apri);
  const prima = await schedeDashboard(app.page);
  const corpo = scheda(app.page, 'agenda').locator('.scheda-corpo');
  await corpo.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const p = await puntoIn(corpo);
  await app.page.mouse.move(p.x, p.y);
  await app.page.mouse.down();
  await app.avanzaOra(600);
  assert.equal(await contaSegnaposto(app.page), 0);
  const su = await puntoIn(scheda(app.page, 'meteo'));
  await app.page.mouse.move(su.x, su.y);
  await app.page.mouse.up();
  assert.deepEqual(await schedeDashboard(app.page), prima);
});

test('mentre si trascina la scheda è sollevata e segue il puntatore, e il segnaposto si sposta facendo posto', async ({ apri }) => {
  const app = await apriDashboard(apri);
  const p = await premiTitolo(app, 'spesa');
  const misure = await scheda(app.page, 'spesa').boundingBox();
  await app.avanzaOra(450);
  const sollevata = await scheda(app.page, 'spesa').evaluate((n) => {
    const st = getComputedStyle(n);
    return { posizione: st.position, opacita: Number(st.opacity), ombra: st.boxShadow };
  });
  assert.equal(sollevata.posizione, 'fixed');
  assert.ok(sollevata.opacita < 1 && sollevata.opacita > 0.5, 'leggera trasparenza');
  assert.notEqual(sollevata.ombra, 'none');
  const segnaposto = await app.page.locator('.scheda-segnaposto').boundingBox();
  assert.ok(Math.abs(segnaposto.height - misure.height) < 1, 'il segnaposto ha l\'altezza della scheda');
  assert.ok(Math.abs(segnaposto.width - misure.width) < 1, 'il segnaposto ha la larghezza della scheda');
  assert.deepEqual(await figliGriglia(app.page), ['meteo', 'agenda', 'attivita', 'spesa', 'scheda-segnaposto', 'casa', 'foto']);

  // la scheda segue il puntatore
  await app.page.mouse.move(p.x + 3, p.y - 7);
  await attendi(async () => {
    const dopo = await scheda(app.page, 'spesa').boundingBox();
    assert.ok(Math.abs(dopo.x - (misure.x + 3)) < 1 && Math.abs(dopo.y - (misure.y - 7)) < 1, 'segue il puntatore');
  });

  // portata sopra Attività, il segnaposto prende il suo posto e Attività scende
  const su = await puntoIn(scheda(app.page, 'attivita'));
  await app.page.mouse.move(su.x, su.y);
  await attendi(async () => assert.deepEqual(await figliGriglia(app.page), ['meteo', 'agenda', 'spesa', 'scheda-segnaposto', 'attivita', 'casa', 'foto']));
  await app.page.mouse.up();
  assert.equal(await contaSegnaposto(app.page), 0);
  assert.equal(await scheda(app.page, 'spesa').evaluate((n) => getComputedStyle(n).position), 'static');
  assert.deepEqual(await schedeDashboard(app.page), ['meteo', 'agenda', 'spesa', 'attivita', 'casa', 'foto']);
});

test('le schede fisse non si trascinano e nessuna scheda può essere lasciata prima di loro', async ({ apri }) => {
  const app = await apriDashboard(apri, { scriptIniziale: conImpostazioni({ benvenutoVisto: false }) });
  await app.page.getByRole('region', { name: 'Benvenuti' }).waitFor();
  const prima = ['benvenuto', 'meteo', 'agenda', 'attivita', 'spesa', 'casa', 'foto'];
  assert.deepEqual(await schedeDashboard(app.page), prima);

  await afferraEPorta(app, 'meteo', 'benvenuto');
  assert.deepEqual(await figliGriglia(app.page), ['benvenuto', 'meteo', 'scheda-segnaposto', 'agenda', 'attivita', 'spesa', 'casa', 'foto']);
  await app.page.mouse.up();
  assert.deepEqual(await schedeDashboard(app.page), prima);

  await premiTitolo(app, 'benvenuto');
  await app.avanzaOra(600);
  assert.equal(await contaSegnaposto(app.page), 0);
  const su = await puntoIn(scheda(app.page, 'agenda'));
  await app.page.mouse.move(su.x, su.y);
  await app.page.mouse.up();
  assert.deepEqual(await schedeDashboard(app.page), prima);
});

test('si salva l\'ordine completo: le schede nascoste restano attaccate alla scheda visibile che le precede', async ({ apri }) => {
  const app = await apriDashboard(apri, { scriptIniziale: conImpostazioni({ ordineSchede: ['meteo', 'agenda', 'attivita', 'spesa', 'casa', 'foto'], schedeVisibili: { agenda: false, foto: false } }) });
  assert.deepEqual(await schedeDashboard(app.page), ['meteo', 'attivita', 'spesa', 'casa']);
  await afferraEPorta(app, 'meteo', 'spesa');
  await app.page.mouse.up();
  assert.deepEqual(await schedeDashboard(app.page), ['attivita', 'spesa', 'meteo', 'casa']);
  await app.vai('#/impostazioni');
  assert.deepEqual(await righeImpostazioni(app.page), ['attivita', 'spesa', 'meteo', 'agenda', 'casa', 'foto']);
  await app.page.getByRole('region', { name: 'Schede della dashboard' }).getByRole('checkbox', { name: 'Agenda' }).check();
  await app.vai('#/');
  assert.deepEqual(await schedeDashboard(app.page), ['attivita', 'spesa', 'meteo', 'agenda', 'casa']);
});

/** Un punto della finestra fuori dalla griglia della dashboard. */
async function fuoriDallaGriglia(page) {
  return page.locator('.dashboard-griglia').evaluate((g) => {
    const r = g.getBoundingClientRect();
    if (r.top > 4) return { x: r.left + 10, y: r.top - 3 };
    if (r.bottom < window.innerHeight - 4) return { x: r.left + 10, y: r.bottom + 3 };
    return { x: r.left - 3, y: window.innerHeight / 2 };
  });
}

test('il rilascio fuori dalla griglia, Esc e pointercancel annullano e rimettono la scheda dov\'era', async ({ apri }) => {
  const app = await apriDashboard(apri);
  const prima = ['meteo', 'agenda', 'attivita', 'spesa', 'casa', 'foto'];
  await app.page.evaluate(() => {
    window.addEventListener('pointerdown', (e) => { window.__idPuntatore = e.pointerId; }, true);
  });

  async function controllaAnnullato() {
    assert.deepEqual(await figliGriglia(app.page), prima);
    assert.equal(await app.page.locator('.scheda-sollevata').count(), 0);
  }

  // rilascio fuori dalla griglia
  await afferraEPorta(app, 'agenda', 'spesa');
  assert.notDeepEqual(await schedeDashboard(app.page), prima);
  const fuori = await fuoriDallaGriglia(app.page);
  await app.page.mouse.move(fuori.x, fuori.y, { steps: 4 });
  await app.page.mouse.up();
  await controllaAnnullato();

  // Esc
  await afferraEPorta(app, 'agenda', 'spesa');
  await app.page.keyboard.press('Escape');
  await controllaAnnullato();
  await app.page.mouse.up();
  await controllaAnnullato();

  // pointercancel (il browser interrompe il gesto)
  await afferraEPorta(app, 'agenda', 'spesa');
  await app.page.evaluate(() => {
    document.querySelector('.dashboard-griglia').dispatchEvent(new PointerEvent('pointercancel', { pointerId: window.__idPuntatore, isPrimary: true, bubbles: true }));
  });
  await controllaAnnullato();
  await app.page.mouse.up();

  await salvataggiFiniti(app);
  await app.ricarica();
  assert.deepEqual(await schedeDashboard(app.page), prima);
});

// Con window.__guasto = true la scrittura nella raccolta 'impostazioni' fallisce, come con lo spazio esaurito.
function guastoImpostazioni() {
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function () {
    if (window.__guasto && this.name === 'impostazioni') throw new DOMException('Spazio finito', 'QuotaExceededError');
    return put.apply(this, arguments);
  };
}

test('se l\'ordine non è cambiato non si salva niente', async ({ apri }) => {
  const app = await apriDashboard(apri, { scriptIniziale: conImpostazioni({}) + '(' + guastoImpostazioni + ')();' });
  await app.page.evaluate(() => { window.__guasto = true; });
  // portata sopra un'altra scheda e poi riportata al suo posto
  await afferraEPorta(app, 'agenda', 'meteo');
  await attendi(async () => assert.deepEqual(await figliGriglia(app.page), ['agenda', 'scheda-segnaposto', 'meteo', 'attivita', 'spesa', 'casa', 'foto']));
  const ritorno = await puntoIn(scheda(app.page, 'meteo'));
  await app.page.mouse.move(ritorno.x, ritorno.y);
  await attendi(async () => assert.deepEqual(await figliGriglia(app.page), ['meteo', 'agenda', 'scheda-segnaposto', 'attivita', 'spesa', 'casa', 'foto']));
  await app.page.mouse.up();
  assert.deepEqual(await schedeDashboard(app.page), ['meteo', 'agenda', 'attivita', 'spesa', 'casa', 'foto']);
  await app.avanzaOra(1000);
  assert.equal(await app.page.locator('.toast').count(), 0, 'nessun salvataggio, quindi nessun errore');
});

test('se il salvataggio fallisce l\'ordine sullo schermo torna quello di prima e compare il messaggio di errore', async ({ apri }) => {
  const app = await apriDashboard(apri, { scriptIniziale: conImpostazioni({}) + '(' + guastoImpostazioni + ')();' });
  const prima = ['meteo', 'agenda', 'attivita', 'spesa', 'casa', 'foto'];
  await app.page.evaluate(() => { window.__guasto = true; });
  await afferraEPorta(app, 'agenda', 'meteo');
  await app.page.mouse.up();
  await attendi(async () => assert.match(await app.page.locator('body').textContent(), /Spazio esaurito/));
  await attendi(async () => assert.deepEqual(await schedeDashboard(app.page), prima));
  await app.page.evaluate(() => { window.__guasto = false; });
  // dopo l'errore il trascinamento continua a funzionare (un secondo trascinamento col mouse non diventa un
  // drag-and-drop nativo di una selezione del testo, che il browser annullerebbe con pointercancel)
  await afferraEPorta(app, 'spesa', 'agenda');
  await app.page.mouse.up();
  assert.deepEqual(await schedeDashboard(app.page), ['meteo', 'spesa', 'agenda', 'attivita', 'casa', 'foto']);
  await salvataggiFiniti(app);
  await app.ricarica();
  assert.deepEqual(await schedeDashboard(app.page), ['meteo', 'spesa', 'agenda', 'attivita', 'casa', 'foto']);
});

test('il trascinamento sposta i riquadri senza ridisegnarli: il cambio di giorno e il meteo continuano a funzionare', async ({ apri }) => {
  const app = await apriDashboard(apri, { ora: '2026-10-28T23:58:30' });
  await app.page.evaluate(() => {
    CasaNostra.ui.registraScheda({
      id: 'prova-data', titolo: 'Prova data', ordine: 1, dipendeDallaData: true,
      disegna: (corpo, contesto) => { corpo.appendChild(CasaNostra.ui.el('p', { testo: 'Oggi è ' + contesto.oggi })); }
    });
    return CasaNostra.ui.ridisegna();
  });
  const previsioni = await app.rete('https://api.open-meteo.com/**', { json: require('../lib/meteo-finto').rispostaMeteoFinta() });
  assert.deepEqual(await schedeDashboard(app.page), ['prova-data', 'meteo', 'agenda', 'attivita', 'spesa', 'casa', 'foto']);
  // segno sui nodi: se una scheda venisse ridisegnata il suo contenuto cambierebbe nodo
  await app.page.evaluate(() => document.querySelectorAll('.dashboard-griglia > section .scheda-corpo > *').forEach((n) => { n.__segno = true; }));

  await afferraEPorta(app, 'prova-data', 'agenda');
  await app.page.mouse.up();
  const atteso = ['meteo', 'agenda', 'prova-data', 'attivita', 'spesa', 'casa', 'foto'];
  assert.deepEqual(await schedeDashboard(app.page), atteso);
  assert.equal(await app.page.evaluate(() => Array.prototype.every.call(
    document.querySelectorAll('.dashboard-griglia > section .scheda-corpo > *'), (n) => n.__segno === true)), true, 'nessuna scheda ridisegnata');

  await app.avanzaOra(2 * 60 * 1000);
  const prova = app.page.getByRole('region', { name: 'Prova data' });
  await attendi(async () => assert.match(await prova.textContent(), /Oggi è 2026-10-29/));
  assert.deepEqual(await schedeDashboard(app.page), atteso);

  await app.avanzaOra(31 * 60 * 1000);
  await attendi(async () => assert.ok(previsioni.richieste.length >= 1, 'il meteo si aggiorna dopo 30 minuti'));
  assert.deepEqual(await schedeDashboard(app.page), atteso);
});

// ---------- tocco vero (ticket #21) ----------
// page.touchscreen fa solo tap: gli eventi touch passano da CDP (Input.dispatchTouchEvent), che li fa entrare nella
// pipeline di input di Chromium come un dito vero (con touch-action, scorrimento e pointercancel). Serve un contesto
// con touch: il viewport smartphone ce l'ha.

/** Un dito su CDP: giu(x, y), sposta(x, y, passi), su(). */
async function dito(app) {
  const cdp = await app.contesto.newCDPSession(app.page);
  let ultimo = null;
  function invia(type, punto) {
    return cdp.send('Input.dispatchTouchEvent', { type: type, touchPoints: punto ? [{ x: punto.x, y: punto.y }] : [] });
  }
  return {
    async giu(x, y) { ultimo = { x, y }; await invia('touchStart', ultimo); },
    async sposta(x, y, passi) {
      const da = ultimo;
      const n = passi || 1;
      for (let i = 1; i <= n; i++) {
        ultimo = { x: da.x + (x - da.x) * i / n, y: da.y + (y - da.y) * i / n };
        await invia('touchMove', ultimo);
      }
    },
    async su() { await invia('touchEnd', null); }
  };
}

/** Il punto del titolo di `id` da toccare (porta il titolo al centro della finestra). */
async function puntoTitolo(app, id) {
  const titolo = scheda(app.page, id).locator('.scheda-titolo');
  await titolo.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const b = await titolo.boundingBox();
  return { x: b.x + 20, y: b.y + b.height / 2 };
}

function scorrimento(page) { return page.evaluate(() => Math.round(window.scrollY)); }

test('col dito, uno scorrimento che parte dal titolo fa scorrere la pagina e non trascina la scheda', async ({ apri }) => {
  const app = await apriDashboard(apri, { viewport: 'smartphone' });
  const prima = await schedeDashboard(app.page);
  const p = await puntoTitolo(app, 'spesa');
  const y0 = await scorrimento(app.page);
  const d = await dito(app);
  await d.giu(p.x, p.y);
  await d.sposta(p.x, p.y - 200, 10);
  await attendi(async () => assert.ok(await scorrimento(app.page) > y0 + 100, 'la pagina scorre'));
  await app.avanzaOra(600);
  assert.equal(await contaSegnaposto(app.page), 0);
  await d.su();
  assert.deepEqual(await schedeDashboard(app.page), prima);
});

test('col dito, una pressione prolungata sul titolo seguita da uno spostamento riordina, e la pagina non scorre sotto il dito', async ({ apri }) => {
  const app = await apriDashboard(apri, { viewport: 'smartphone' });
  assert.deepEqual(await schedeDashboard(app.page), ['meteo', 'agenda', 'attivita', 'spesa', 'casa', 'foto']);
  const p = await puntoTitolo(app, 'spesa');
  const y0 = await scorrimento(app.page);
  const d = await dito(app);
  await d.giu(p.x, p.y);
  await app.avanzaOra(450);
  assert.equal(await contaSegnaposto(app.page), 1);
  const su = await puntoIn(scheda(app.page, 'attivita'));
  await d.sposta(su.x, su.y, 8);
  await attendi(async () => assert.deepEqual(await figliGriglia(app.page), ['meteo', 'agenda', 'spesa', 'scheda-segnaposto', 'attivita', 'casa', 'foto']));
  assert.equal(await scorrimento(app.page), y0, 'la pagina non scorre sotto il dito');
  await d.su();
  assert.deepEqual(await schedeDashboard(app.page), ['meteo', 'agenda', 'spesa', 'attivita', 'casa', 'foto']);
  await salvataggiFiniti(app);
  await app.ricarica();
  assert.deepEqual(await schedeDashboard(app.page), ['meteo', 'agenda', 'spesa', 'attivita', 'casa', 'foto']);
});

test('la pressione prolungata sul titolo non apre il menu contestuale e non seleziona il testo', async ({ apri }) => {
  const app = await apriDashboard(apri, { viewport: 'smartphone' });
  const titolo = scheda(app.page, 'agenda').locator('.scheda-titolo');
  // Il menu contestuale arriva al titolo come evento contextmenu (su touch dopo la pressione prolungata). Chrome sul
  // computer non lo genera da una pressione lunga via CDP, quindi l'evento si manda a mano: va annullato.
  const prevenuto = await titolo.evaluate((el) => {
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  assert.equal(prevenuto, true, 'il menu contestuale non si apre');
  assert.equal(await titolo.evaluate((el) => getComputedStyle(el).userSelect), 'none', 'niente selezione del testo');
});

// ---------- scorrimento automatico (ticket #21) ----------

/** scriptIniziale: conta i requestAnimationFrame ancora in attesa (window.__fotogrammiInAttesa()). */
function contaFotogrammi() {
  const raf = window.requestAnimationFrame;
  const caf = window.cancelAnimationFrame;
  const attesa = new Set();
  window.__fotogrammiInAttesa = () => attesa.size;
  window.requestAnimationFrame = function (fn) {
    const id = raf.call(window, function () { attesa.delete(id); return fn.apply(this, arguments); });
    attesa.add(id);
    return id;
  };
  window.cancelAnimationFrame = function (id) { attesa.delete(id); return caf.call(window, id); };
}

test('vicino al bordo alto la pagina sale da sola a velocità fissa: con lo smartphone l\'ultima scheda va in prima posizione', async ({ apri }) => {
  const app = await apriDashboard(apri, { viewport: 'smartphone', scriptIniziale: conImpostazioni({}) + '(' + contaFotogrammi + ')();' });
  assert.deepEqual(await schedeDashboard(app.page), ['meteo', 'agenda', 'attivita', 'spesa', 'casa', 'foto']);
  await app.avanzaOra(1000);
  assert.equal(await app.page.evaluate(() => window.__fotogrammiInAttesa()), 0, 'nessun ciclo prima del trascinamento');
  await app.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const p = await premiTitolo(app, 'foto');
  await app.avanzaOra(450);
  assert.equal(await contaSegnaposto(app.page), 1);
  const ySotto = await scorrimento(app.page);
  assert.ok(ySotto > 300, 'la prima scheda è fuori dalla finestra');

  // al centro della finestra la pagina resta ferma
  await app.page.mouse.move(p.x, 400);
  await app.avanzaOra(500);
  assert.equal(await scorrimento(app.page), ySotto);

  // entro 60 px dal bordo alto la pagina sale a velocità fissa
  await app.page.mouse.move(p.x, 30);
  await app.avanzaOra(200);
  const dopo200 = await scorrimento(app.page);
  assert.ok(dopo200 < ySotto, 'la pagina sale');
  await app.avanzaOra(200);
  const dopo400 = await scorrimento(app.page);
  assert.ok(Math.abs((ySotto - dopo200) - (dopo200 - dopo400)) <= 20, 'velocità fissa: ' + [ySotto, dopo200, dopo400]);
  await app.avanzaOra(10000);
  assert.equal(await scorrimento(app.page), 0, 'arriva in cima');
  // mentre la pagina scorre il segnaposto segue le schede che passano sotto il puntatore fermo
  assert.deepEqual(await figliGriglia(app.page), ['foto', 'scheda-segnaposto', 'meteo', 'agenda', 'attivita', 'spesa', 'casa']);
  // si lascia la scheda sul segnaposto (in cima alla pagina il bordo alto è sopra la griglia)
  const su = await puntoIn(app.page.locator('.scheda-segnaposto'));
  await app.page.mouse.move(su.x, su.y);
  await app.page.mouse.up();
  assert.deepEqual(await schedeDashboard(app.page), ['foto', 'meteo', 'agenda', 'attivita', 'spesa', 'casa']);

  // il ciclo esiste solo durante il trascinamento
  await app.avanzaOra(1000);
  assert.equal(await app.page.evaluate(() => window.__fotogrammiInAttesa()), 0, 'nessun ciclo dopo il trascinamento');
  await salvataggiFiniti(app);
  await app.ricarica();
  assert.deepEqual(await schedeDashboard(app.page), ['foto', 'meteo', 'agenda', 'attivita', 'spesa', 'casa']);
});

test('vicino al bordo basso la pagina scende da sola', async ({ apri }) => {
  const app = await apriDashboard(apri, { viewport: 'smartphone' });
  await app.page.evaluate(() => window.scrollTo(0, 0));
  const t = await scheda(app.page, 'meteo').locator('.scheda-titolo').boundingBox();
  await app.page.mouse.move(t.x + 20, t.y + t.height / 2);
  await app.page.mouse.down();
  await app.avanzaOra(450);
  assert.equal(await contaSegnaposto(app.page), 1);
  const altezza = await app.page.evaluate(() => window.innerHeight);
  await app.page.mouse.move(t.x + 20, altezza - 20);
  await app.avanzaOra(300);
  assert.ok(await scorrimento(app.page) > 0, 'la pagina scende');
  await app.page.keyboard.press('Escape');
  await app.page.mouse.up();
});
