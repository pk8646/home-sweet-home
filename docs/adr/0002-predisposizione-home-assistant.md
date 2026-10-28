# Home Assistant: predisposto, non integrato

In questa versione non c'è alcun codice Home Assistant, né campi URL/token segnaposto: senza un'istanza reale sarebbero controlli finti. L'aggancio futuro previsto è un modulo separato (es. `homeassistant.js`) che chiama l'API REST di Home Assistant con un token a lunga durata inserito dall'utente e salvato solo sul dispositivo, e una nuova scheda della dashboard che legge da quel modulo senza passare da `db.js`.

## Conseguenze

- Il sito è servito in HTTPS da GitHub Pages, quindi l'istanza Home Assistant dovrà essere raggiungibile in HTTPS (le richieste verso `http://` in rete locale vengono bloccate come contenuto misto) e dovrà consentire l'origine del sito nella configurazione CORS (`http.cors_allowed_origins`).
- Il token dà pieno accesso alla casa: non deve mai finire nel backup dati né nel repository.
