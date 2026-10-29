'use strict';
// Helper del ticket #7: apre l'app con dati già presenti nel database al primo avvio, per esempio senza la
// scheda "Benvenuti".
//   const { senzaBenvenuto, conDatiIniziali } = require('../lib/benvenuto');
//   const app = await apri({ scriptIniziale: senzaBenvenuto });
//   const app = await apri({ scriptIniziale: conDatiIniziali({ impostazioni: [{ id: 'impostazioni', benvenutoVisto: true }], attivita: [...] }) });
//
// Agisce dall'esterno, senza interruttori nel codice dell'app: quando l'app crea il suo database IndexedDB
// (primo avvio nel contesto pulito del test), scrive i record indicati nelle rispettive raccolte, come se
// l'utente li avesse già inseriti. La scrittura parte prima della prima lettura dell'app (stessa connessione,
// transazione readwrite creata per prima). Ai ricaricamenti successivi il database esiste già e non viene
// toccato. Entrambi sono script in forma di stringa: si combinano con altri script iniziali per concatenazione,
// per esempio senzaBenvenuto + '(' + altroScript + ')();'.

/** Eseguita nella pagina: `raccolte` è { nomeRaccolta: [record, ...] }. */
function scriviAlPrimoAvvio(raccolte) {
  if (!window.indexedDB || !/^https?:$/.test(location.protocol)) return;
  const apriOriginale = IDBFactory.prototype.open;
  IDBFactory.prototype.open = function () {
    const richiesta = apriOriginale.apply(this, arguments);
    let creato = false;
    richiesta.addEventListener('upgradeneeded', function (ev) { if (ev.oldVersion === 0) creato = true; });
    richiesta.addEventListener('success', function () {
      if (!creato) return;
      creato = false;
      try {
        const nomi = Object.keys(raccolte);
        const tx = richiesta.result.transaction(nomi, 'readwrite');
        nomi.forEach(function (nome) {
          raccolte[nome].forEach(function (record) { tx.objectStore(nome).put(record); });
        });
      } catch (e) { /* raccolta assente: si lascia il database com'è */ }
    });
    return richiesta;
  };
}

/** Script iniziale che al primo avvio scrive i record indicati: { nomeRaccolta: [record, ...] }. */
function conDatiIniziali(raccolte) {
  return '(' + scriviAlPrimoAvvio + ')(' + JSON.stringify(raccolte) + ');';
}

/** Script iniziale che toglie la scheda "Benvenuti", come se l'utente avesse già toccato "Ho capito". */
const senzaBenvenuto = conDatiIniziali({ impostazioni: [{ id: 'impostazioni', benvenutoVisto: true }] });

module.exports = { senzaBenvenuto, conDatiIniziali };
