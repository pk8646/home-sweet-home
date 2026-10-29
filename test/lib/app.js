'use strict';
// Apertura dell'app in un contesto pulito con cattura errori, orologio, rete e viewport.

const { VIEWPORT, oraRoma } = require('./test');

function creaApri(browser, sito, ambiente) {
  const aperte = [];

  /**
   * Apre Casa Nostra in un contesto del browser nuovo (storage vuoto).
   * opzioni:
   *   percorso: hash iniziale, es. '#/spesa' (default: dashboard)
   *   viewport: nome di VIEWPORT ('tabletOrizzontale', 'tabletVerticale', 'smartphone', 'desktop') o {width,height}
   *   ora: orario locale di Roma 'AAAA-MM-GGTHH:MM[:SS]' (o Date/number): installa l'orologio finto, che poi scorre
   *   oraFissa: true -> l'orologio resta fermo su `ora` (i timer avanzano solo con app.orologio.runFor/fastForward)
   *   senzaIndexedDB: true -> window.indexedDB non esiste
   *   serviceWorker: 'block' (default) | 'allow'
   *   rete: [{ url: glob|RegExp, json|corpo|stato|ritardoMs|assente|gestore }] intercettazioni iniziali
   *   scriptIniziale: funzione o stringa eseguita prima degli script della pagina (addInitScript)
   *   consentiErrori: true | [RegExp] -> errori di console da non considerare "non gestiti"
   *   attendiPronta: false -> non aspetta che l'app segnali data-casa-nostra="pronta"
   *   contesto: opzioni extra per browser.newContext
   */
  const apri = async function apri(opzioni) {
    const o = opzioni || {};
    let vp = o.viewport || ambiente.viewportPredefinito || 'tabletOrizzontale';
    if (typeof vp === 'string') {
      if (!VIEWPORT[vp]) throw new Error('Viewport sconosciuto: ' + vp);
      vp = VIEWPORT[vp];
    } else if (vp.width) {
      vp = { viewport: vp };
    }
    const contesto = await browser.newContext(Object.assign({
      locale: 'it-IT',
      timezoneId: 'Europe/Rome',
      serviceWorkers: o.serviceWorker || 'block',
      acceptDownloads: true
    }, vp, o.contesto || {}));

    const app = {
      contesto: contesto,
      context: contesto,
      sito: sito,
      url: sito.url,
      errori: [],
      richiesteEsterne: [],
      consentiErrori: o.consentiErrori || []
    };
    aperte.push(app);

    if (o.ora !== undefined) {
      const t = typeof o.ora === 'string' ? oraRoma(o.ora) : o.ora;
      await contesto.clock.install({ time: t });
      if (o.oraFissa) await contesto.clock.pauseAt(t);
    }
    if (o.senzaIndexedDB) {
      await contesto.addInitScript(function () {
        Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true });
      });
    }
    if (o.scriptIniziale) await contesto.addInitScript(o.scriptIniziale);

    // Tutto ciò che esce dal server di prova viene bloccato e registrato, salvo intercettazioni esplicite.
    await contesto.route('**/*', function (route) {
      const u = route.request().url();
      if (u.startsWith(sito.origine) || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
      app.richiesteEsterne.push(u);
      return route.abort('internetdisconnected');
    });

    /**
     * Intercetta richieste: risposta = { json, corpo, stato=200, intestazioni, ritardoMs, assente, gestore(route) }.
     * Restituisce { richieste: [url...] }. Le intercettazioni successive hanno precedenza.
     */
    app.rete = async function (url, risposta) {
      const r = risposta || {};
      const traccia = { richieste: [] };
      await contesto.route(url, async function (route) {
        traccia.richieste.push(route.request().url());
        if (r.ritardoMs) await new Promise(function (ok) { setTimeout(ok, r.ritardoMs); });
        if (r.gestore) return r.gestore(route);
        if (r.assente) return route.abort('internetdisconnected').catch(function () {});
        const corpo = r.json !== undefined ? JSON.stringify(r.json) : (r.corpo || '');
        return route.fulfill({
          status: r.stato || 200,
          headers: Object.assign({ 'Access-Control-Allow-Origin': '*' }, r.intestazioni || {}),
          contentType: r.json !== undefined ? 'application/json' : (r.tipo || 'text/plain'),
          body: corpo
        }).catch(function () {});
      });
      return traccia;
    };
    for (const voce of o.rete || []) await app.rete(voce.url, voce);

    const page = await contesto.newPage();
    app.page = page;
    app.pagina = page;
    app.orologio = page.clock;
    page.setDefaultTimeout(o.timeoutAzioni || 5000);

    page.on('pageerror', function (err) {
      app.errori.push({ tipo: 'pageerror', testo: String(err && err.stack || err) });
    });
    page.on('console', function (msg) {
      if (msg.type() !== 'error') return;
      const luogo = msg.location() || {};
      const testo = msg.text();
      // Le risorse esterne bloccate dal test non sono errori dell'app.
      if (/Failed to load resource/.test(testo) && luogo.url && !luogo.url.startsWith(sito.origine)) return;
      app.errori.push({ tipo: 'console', testo: testo + (luogo.url ? ' (' + luogo.url + ')' : '') });
    });

    /** Errori di console/pageerror non consentiti. */
    app.erroriNonGestiti = function () {
      if (app.consentiErrori === true) return [];
      return app.errori.filter(function (e) {
        return !app.consentiErrori.some(function (re) { return re.test(e.testo); });
      });
    };

    /** Aspetta che l'app abbia finito di disegnare la vista corrente. */
    app.attendiPronta = async function () {
      await page.waitForFunction(function () {
        return document.documentElement.getAttribute('data-casa-nostra') === 'pronta';
      }, null, { timeout: 10000 });
    };

    /** Naviga a un hash (es. '#/spesa') come farebbe un link. */
    app.vai = async function (hash) {
      await page.evaluate(function (h) {
        document.documentElement.setAttribute('data-casa-nostra', 'in-corso');
        location.hash = h;
      }, hash);
      await app.attendiPronta();
    };

    app.ricarica = async function () {
      await page.reload();
      if (o.attendiPronta !== false) await app.attendiPronta();
    };

    app.indietro = async function () {
      await page.goBack();
      await app.attendiPronta();
    };

    /** Avanza l'orologio finto di ms millisecondi, eseguendo i timer (richiede l'opzione `ora`). */
    app.avanzaOra = function (ms) { return page.clock.runFor(ms); };

    /** Esegue azione() e cattura il download: { nome, contenuto: Buffer, testo: string }. */
    app.scaricamento = async function (azione) {
      const [dl] = await Promise.all([page.waitForEvent('download'), azione()]);
      const flusso = await dl.createReadStream();
      const pezzi = [];
      for await (const p of flusso) pezzi.push(p);
      const contenuto = Buffer.concat(pezzi);
      return { nome: dl.suggestedFilename(), contenuto: contenuto, testo: contenuto.toString('utf8') };
    };

    /** Dimensioni dell'area visibile e overflow orizzontale del documento. */
    app.overflowOrizzontale = function () {
      return page.evaluate(function () {
        return document.documentElement.scrollWidth - document.documentElement.clientWidth;
      });
    };

    await page.goto(sito.url + (o.percorso || ''));
    if (o.attendiPronta !== false) await app.attendiPronta();
    return app;
  };

  apri._aperte = aperte;
  return apri;
}

module.exports = { creaApri };
