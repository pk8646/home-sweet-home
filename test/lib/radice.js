'use strict';
// Radice del sito servito ai test, condivisa da run.js e server.js.
// Precedenza: la cartella indicata esplicitamente (--root o primo argomento del server), poi la variabile
// d'ambiente CASA_NOSTRA_ROOT, infine la radice del repository (la cartella che contiene test/).

const path = require('path');

const RADICE_REPOSITORY = path.resolve(__dirname, '..', '..');

/** Percorso assoluto della radice del sito; `esplicita` vuota o assente = CASA_NOSTRA_ROOT o la radice del repository. */
function radiceDelSito(esplicita) {
  return path.resolve(esplicita || process.env.CASA_NOSTRA_ROOT || RADICE_REPOSITORY);
}

module.exports = { radiceDelSito };
