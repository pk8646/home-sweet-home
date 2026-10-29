'use strict';
// Helper del ticket #7: apre l'app senza la scheda "Benvenuti" del primo avvio.
//   const { senzaBenvenuto } = require('../lib/benvenuto');
//   const app = await apri({ scriptIniziale: senzaBenvenuto });
//
// Agisce dall'esterno, senza interruttori nel codice dell'app: quando l'app crea il suo database IndexedDB
// (primo avvio nel contesto pulito del test), scrive nel record delle impostazioni benvenutoVisto: true,
// come se l'utente avesse già toccato "Ho capito". La scrittura parte prima della prima lettura dell'app
// (stessa connessione, transazione readwrite creata per prima). Ai ricaricamenti successivi il database
// esiste già e non viene toccato. Da combinare con altri script iniziali: '(' + senzaBenvenuto + ')();' + ...

function senzaBenvenuto() {
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
        const tx = richiesta.result.transaction('impostazioni', 'readwrite');
        tx.objectStore('impostazioni').put({ id: 'impostazioni', benvenutoVisto: true });
      } catch (e) { /* raccolta assente: si lascia il benvenuto */ }
    });
    return richiesta;
  };
}

module.exports = { senzaBenvenuto };
