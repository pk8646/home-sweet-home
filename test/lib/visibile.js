'use strict';
// Che cosa si vede sullo schermo, da usare dentro page.evaluate / locator.evaluate / evaluateAll.
//   const { conVisibile } = require('../lib/visibile');
//   await page.evaluate(conVisibile(function () { return [...document.querySelectorAll('button')].filter(visibile).length; }));
//
// Playwright manda alla pagina solo il testo della funzione, senza le variabili che la circondano:
// conVisibile restituisce una funzione equivalente a `fn` (stessi argomenti, stesso risultato) il cui testo
// contiene anche la definizione di `visibile`, che `fn` può quindi usare come variabile libera.

/**
 * Eseguita nella pagina: true se l'elemento occupa spazio sullo schermo, più di 1 px per lato. Così non
 * contano gli elementi nascosti (display: none, dimensioni nulle) né il testo solo per i lettori di schermo,
 * ritagliato a 1 px.
 */
function visibile(n) {
  const r = n.getBoundingClientRect();
  return r.width > 1 && r.height > 1;
}

function conVisibile(fn) {
  return new Function('return function (a, b) { const visibile = ' + visibile + '; return (' + fn + ')(a, b); };')();
}

module.exports = { conVisibile };
