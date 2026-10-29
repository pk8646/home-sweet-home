# Casa Nostra: architettura e test (nota per gli implementer, dal ticket #2)

## File del sito (script classici, ognuno aggiunge UNA proprietà a `window.CasaNostra`)
index.html carica già TUTTI i file: **non serve toccarlo**. Basta sostituire il contenuto del proprio segnaposto.
- Nucleo: `js/casanostra.js` (`nuovoId()`, `alPronto(fn)`, `PREFISSO_LOCALSTORAGE = 'casaNostra.'`), `date.js` (`CasaNostra.date`: `oggi()`, `ora()`, `valida`, `oraValida`,
  `aggiungiGiorni`, `differenzaGiorni`, `giornoSettimana`, `formattaLunga/Breve/GiornoMese/GiornoBreve`), `db.js`, `errori.js`, `ui.js`, `dialoghi.js`, `impostazioni.js`, `avvio.js` (ultimo).
- Dominio puro: `js/dominio/{spesa,agenda,attivita,casa}.js` -> `CasaNostra.dominio.<id>`.
- Servizi (solo logica, niente interfaccia): `js/meteo.js`, `js/foto.js`, `js/archivio-foto.js`, `js/presentazione.js`, `js/backup.js`, `js/pwa.js` -> `CasaNostra.<nome>`.
- Sezioni (interfaccia): `js/sezioni/{dashboard,spesa,agenda,attivita,casa,meteo,foto,archivio-foto,backup,impostazioni}.js`.
  Alcune espongono `CasaNostra.sezioni.<id>`; meteo, archivio-foto e backup registrano solo schede/gruppi e non espongono nulla.
- CSS: `css/base.css` (variabili: --crema --carta --salvia --terracotta --errore --tocco=48px ...), `layout.css`, `componenti.css`,
  e uno per sezione in `css/sezioni/<id>.css` (già collegati).
- Un file NUOVO (js o css) va aggiunto a index.html: il test statico fallisce se un .js/.css non è incluso (sw.js escluso).
- PWA (#12): chi aggiunge un file a index.html (o un'icona al manifest, o una risorsa caricata via fetch) aggiunge UNA riga
  con lo stesso percorso relativo all'elenco `RISORSE` in `sw.js`, nel gruppo giusto. `tests/pwa.test.js` fallisce se le
  due liste divergono (in entrambi i versi). NON cambiare `VERSIONE` in sw.js nei ticket: si aumenta solo al rilascio.
  I test usano `serviceWorker:'block'` di default: il SW non interferisce; `apri({ serviceWorker:'allow' })` per provarlo.

## Aggiungere una sezione / scheda / gruppo di impostazioni (in `js/sezioni/<id>.js`)
```js
CasaNostra.ui.registraSezione({ id: 'agenda', titolo: 'Agenda', icona: '📅', ordine: 30,
  disegna: function (contenitore, contesto) { /* può restituire Promise */ },
  esci: function () {}, dipendeDallaData: true /* o alCambioGiorno(contesto) */ });
CasaNostra.ui.registraScheda({ id: 'agenda', titolo: 'Agenda', icona: '📅', ordine: 30, dipendeDallaData: true,
  nascondibile: true, disegna: function (corpo, contesto) { /* return false = scheda nascosta */ }, esci: fn });
CasaNostra.ui.registraGruppoImpostazioni({ id: 'localita', titolo: 'Località del meteo', ordine: 20, disegna: fn });
```
- `contesto = { oggi:'AAAA-MM-GG', adesso: Date, parametri: [...da #/id/a/b], ridisegna() }`.
- Ordini nav/sezioni già usati: home 0, spesa 20, agenda 30, attivita 40, casa 50, foto 60, impostazioni 90.
  Ordini schede suggeriti: benvenuto/avvisi 1-5, meteo 10, agenda 30, attivita 40, spesa 50 (usato), casa 60, foto 70.
  Ordini gruppi impostazioni: generali 10, località 20, dashboard 30, schermo 40, backup 60, archivio 70, privacy 80, ripristino 90.
- La dashboard disegna ogni scheda in isolamento (errore -> messaggio nella scheda) e salta quelle con
  `impostazioni.schedeVisibili[id] === false` (salvo `nascondibile:false`). `CasaNostra.ui.schede()` elenca le schede (per i toggle).
- Una sezione segnaposto `ui.registraSezione` va sostituita, non duplicata (stesso id = sovrascrive).
- Pagina Impostazioni (`js/sezioni/impostazioni.js`) già compone i gruppi registrati, ciascuno in isolamento.

## UI
- `CasaNostra.ui.el(tag, { class, testo, on:{click:fn}, 'aria-label':..., disabled:true }, figli)`: testo utente SOLO così (textContent).
  `ui.svuota(n)`, `ui.linkVediTutti('agenda', n)` -> "Vedi tutti (n)", `ui.messaggioErrore(err, 'Testo.')`,
  `ui.toast(testo, { tipo:'info'|'successo'|'errore', azione:{ testo:'Ricarica', esegui:fn } })`, `ui.avviso(id, testo|null, tipo)` (banner globale),
  `ui.ridisegna()`, `ui.impostaNomeCasa(nome)`, `ui.iconaAvviso()` (span "⚠️ " aria-hidden davanti agli avvisi), `ui.scaricaBlob(blob, nome)` (unico modo di far scaricare un file).
- Dialoghi: `CasaNostra.dialoghi.conferma({ titolo, messaggio, testoConferma, pericolo, richiediTesto:'CANCELLA' })` -> Promise<bool>
  (con richiediTesto serve il testo esatto, niente trim); `CasaNostra.dialoghi.confermaElimina({ titolo, messaggio }, elimina)` (conferma "Elimina" in rosso, poi `elimina()`);
  `CasaNostra.dialoghi.modulo({ titolo, testoConferma, campi:[{nome, etichetta, tipo:'text|textarea|select|date|time|number|checkbox',
  valore, obbligatorio, opzioni:[{valore,testo}], min, max, aiuto}], valida(valori) -> messaggio|null })` -> Promise<valori|null>.
  I campi facoltativi hanno l'etichetta "X (facoltativo)": nei test usare `getByLabel('X', ...)` con regex o il testo completo.
- Errori: `CasaNostra.errori.perUtente('messaggio')` (mostrato così com'è), `gestisci(err, ctx)` (console.warn + toast),
  `registra(err, ctx)` (solo console.warn), `protetta(fn, ctx)` per i gestori di evento. Gli errori gestiti vanno in console.warn,
  MAI console.error (i test falliscono su console.error/pageerror).
- Classi CSS condivise: `.pulsante .pulsante-primario|secondario|pericolo`, `.pulsante-icona`, `.campo`, `.etichetta`, `.casella`, `.vuoto`, `.scheda`.

## Persistenza
- Raccolte (tutte già nello schema v1, keyPath `id`): prodotti, appuntamenti, attivita, promemoriaCasa, impostazioni, foto.
  `CasaNostra.db.raccolta('attivita').list()/get(id)/put(r)/delete(id)/clear()`; `CasaNostra.db.replaceAll({ prodotti:[...], ... })` (una transazione).
  Errori: `ErroreDB` con `tipo` nonDisponibile|quota|bloccato|generico e messaggio italiano (`CasaNostra.db.traduciErrore(err)`).
  `CasaNostra.db.RACCOLTE` (tutte) e `CasaNostra.db.STRUTTURATE` (tutte tranne foto: quelle del backup dati).
  Al primo `put`/`replaceAll` della sessione `db.js` chiama `navigator.storage.persist()` (feature check, una volta).
- Promemoria casa: `{ id, titolo, categoria, data, note, intervalloGiorni, completato, ultimoCompletamento, creatoIl }` (campo `intervalloGiorni`, come nella spec).
- LocalStorage: una sola chiave, `casaNostra.meteo.copia` = `{ salvataIl, localita, dati, ultimaRichiesta }` (l'orario dell'ultima richiesta sta nel record, non in una chiave a parte).
- Impostazioni: `CasaNostra.impostazioni.leggi()` / `aggiorna({...})`, campi predefiniti: nomeVisualizzato, localita {nome, latitudine,
  longitudine} (Fiumicino), schedeVisibili {}, schermoAcceso, ultimoBackup, benvenutoVisto, avvisoBackupPosticipatoFino.

## Test (nel repo, cartella `test/`, ADR-0003; prima volta: `npm install` dentro `test/`)
```
node test/run.js                                          # tutti, sul sito della radice del repository
node test/run.js agenda                                   # solo tests/agenda.test.js
node test/run.js spesa scheletro --grep "doppioni"
   opzioni: --viewport tabletOrizzontale|tabletVerticale|smartphone|desktop  --paralleli N (default 4)  --headed
   --root <WORKTREE> oppure CASA_NOSTRA_ROOT=<WORKTREE> per un altro worktree. Porta libera casuale: più runner in parallelo sono ok.
   Server manuale: node test/server.js [root].
```
- Ognuno crea il PROPRIO file `tests/<sezione>.test.js` (non modificare quelli altrui). Esistenti: statico, scheletro, spesa.
  Nel proprio worktree i test degli altri ticket possono fallire (funzione non ancora presente): lanciare i propri + statico/scheletro/spesa.
- API: `const { test, assert, attendi, oraRoma, VIEWPORT } = require('../lib/test');`
  `test('nome', async ({ apri, sito, root }) => {...}, { timeout })`. `attendi(async () => assert...)` riprova fino a 5 s.
- `const app = await apri({ percorso:'#/agenda', viewport:'smartphone', ora:'2026-03-29T01:59' (Europe/Rome; poi scorre),
  oraFissa:true, senzaIndexedDB:true, serviceWorker:'allow' (default 'block'), rete:[{url, json|corpo|stato|ritardoMs|assente}],
  scriptIniziale: fn, consentiErrori:[/regex/]|true, attendiPronta:false })`.
- `app.page` (Playwright Page), `app.contesto`, `app.vai('#/x')`, `app.ricarica()`, `app.indietro()`, `app.attendiPronta()`,
  `app.avanzaOra(ms)` (esegue i timer), `app.orologio` (page.clock), `app.rete(glob, risposta)` -> `{ richieste }`,
  `app.richiesteEsterne` (ogni richiesta fuori dal server è bloccata e registrata), `app.scaricamento(() => click)` -> `{ nome, contenuto, testo }`,
  `app.overflowOrizzontale()`. File: `app.page.setInputFiles(...)`.
- Alla fine di ogni test il runner fallisce se ci sono `console.error` o `pageerror` non consentiti.
- L'app segnala `<html data-casa-nostra="pronta">` dopo ogni disegno di vista; `apri/vai/ricarica` lo aspettano.
- Statici (`lib/statico.js`): `controllaSintassi`, `controllaRisorse` (index.html + manifest se collegato), `fileNonInclusi`, `riferimentiHtml`, `elencaFile`.
- Selettori: preferire ruoli/etichette (`getByRole('region', { name: 'Spesa' })` = scheda; pagine hanno `main h2`).
- Benvenuto (#7): al primo avvio la dashboard mostra la scheda "Benvenuti" (ordine 1, non nascondibile, con i pulsanti "Imposta nome e località" e "Ho capito"). Per toglierla nei propri test: `const { senzaBenvenuto } = require('../lib/benvenuto'); apri({ scriptIniziale: senzaBenvenuto })` (agisce dall'esterno: alla creazione del database scrive `benvenutoVisto: true` nelle impostazioni; nessun globale nell'app). Attenzione al nome NON esatto: `getByRole('region', { name: 'Benvenuti' })`. Per altri dati già presenti al primo avvio: `conDatiIniziali({ impostazioni: [...], appuntamenti: [...], ... })` (stesso meccanismo; entrambi sono stringhe, si combinano per concatenazione).
- Helper `lib/visibile.js`: `conVisibile(fn)` rende disponibile `visibile(n)` (elemento più grande di 1 px per lato: esclude nascosti e testo solo per i lettori di schermo) dentro una funzione passata a `evaluate`/`evaluateAll`.
- Helper `lib/radice.js`: `radiceDelSito(esplicita)`, la radice del sito condivisa da `run.js` e `server.js` (argomento esplicito, poi `CASA_NOSTRA_ROOT`, poi la radice del repository).

## Foto (ticket #8) — interfaccia per Presentazione (#9) e Archivio foto (#10)
- `CasaNostra.foto`: `elenco()` (metadati + `miniatura` Blob, SENZA `blob`, dalla più recente), `leggi(id)` (record completo), `blobPieno(id)`, `conta()`,
  `aggiungiElaborata({ id, nome, blob, tipo?, aggiuntaIl?, miniatura?, larghezza?, altezza? })` (non ricomprime; calcola misure/miniatura mancanti), `rigeneraMiniatura(id)`, `elimina(id)`.
  Record `foto`: `{ id, nome, tipo, larghezza, altezza, dimensione, aggiuntaIl ISO, blob, miniatura }` (blob e miniatura nello stesso record).
- URL temporanei: `var g = CasaNostra.foto.gruppoUrl(); g.crea(blob); g.revoca(url); g.revocaTutti()` (revocare in `esci`). `CasaNostra.foto.scarica(record)` scarica col nome.
- Helper test `lib/immagini.js`: `crea(page, { larghezza, altezza, tipo, nome, colore })` -> file per setInputFiles (canvas nel browser), `corrotta(nome)`, `testo(nome)`,
  `misura(page, buffer)`, `tipoDaiByte(buffer)`, scriptIniziale `tracciaUrl` (`window.__urlAttivi`) e `quotaEsaurita` (put su 'foto' -> QuotaExceededError). Input UI: `getByLabel('Aggiungi foto')`.
- Galleria: con IntersectionObserver l'URL di una miniatura esiste solo mentre è vicina allo schermo (si revoca quando esce, `src` tolto); senza, si crea subito.
- Meteo (#6): la scheda Meteo chiama Open-Meteo all'apertura della dashboard. Nessun setInterval: un solo setTimeout puntato sul prossimo aggiornamento (30 minuti), solo con la pagina visibile (`visibilitychange`). Nei test di altre sezioni che passano dalla dashboard e controllano `app.richiesteEsterne`: `const { meteoFinto } = require('../lib/meteo-finto'); apri({ rete: [meteoFinto()] })` (risposta finta per `https://api.open-meteo.com/**`; le richieste intercettate non contano come esterne).
  Scheda compatta (#16): `rispostaMeteoFinta({ ora, temperatura, codice, giorni, codiciGiornalieri, minime, massime, pioggia: { 'AAAA-MM-GGTHH:00': % }, codiciOrari, senzaOrari })` costruisce una risposta con `current`, `hourly` (da mezzanotte di oggi; la temperatura di ogni ora è il suo numero contato da mezzanotte, così ogni casella è riconoscibile) e `daily` (oggi + 3 giorni). La copia in LocalStorage valida ha `dati = { attuale: { temperatura, percepita, vento, codice, minima, massima }, ore: [6 × { ora:'HH:MM', codice, temperatura, pioggia }], giorni: [3 × { data, codice, minima, massima }] }`; una copia nel formato precedente è ignorata e riscaricata. Testo solo per i lettori di schermo: classe `.solo-lettori`.

## Archivio foto (ticket #10)
- `js/archivio-foto.js` (logica) -> `CasaNostra.archivioFoto`: `creaArchivio()` -> `{ blob, quante }`, `esporta()` (scarica `casa-nostra-foto-AAAA-MM-GG.zip`), `importa(file)` -> `{ importate, giaPresenti, nonLeggibili }` (rifiuta con errore perUtente gli ZIP non STORE/non dell'app; non elimina mai foto), `crc32(Uint8Array)`.
  Gruppo impostazioni `archivio` in `js/sezioni/archivio-foto.js` (ordine 70, region "Archivio foto"): pulsante "Esporta archivio foto", input `getByLabel('Importa archivio foto')`, resoconto in `role=status`, errori in `role=alert`. Indice `casa-nostra-foto.json` `{ app:'casa-nostra', schemaVersion:1, esportatoIl, foto:[{ id, nome, aggiuntaIl, tipo, file:'foto/0001-nome' }] }`.
  Il ripristino iniziale (#11) può svuotare le foto con `CasaNostra.db.raccolta('foto').clear()`; nei test `tests/archivio.test.js` ci sono un lettore/scrittore ZIP indipendente (zlib) riusabili copiandoli.

## Backup dati (ticket #11)
- `js/backup.js` (logica) -> `CasaNostra.backup`: `costruisci()`, `esporta()`, `leggiFile(file)`, `leggi(testo)` (valida e migra), `riepilogo(b)`, `importa(b)`, `ripristinoIniziale()`, `giorniDallUltimo()`, `promemoriaDovuto(imp, adesso)`, `posticipaPromemoria()`.
  Interfaccia in `js/sezioni/backup.js`: gruppi `backup` (60) e `ripristino` (90), scheda `avviso-backup` (ordine 2). Le categorie dei promemoria casa vengono da `CasaNostra.dominio.casa.CATEGORIE`.

## CSS per Chromium ≥ 80
- Niente `inset` (usare top/right/bottom/left). `aspect-ratio` solo con ripiego `@supports not (aspect-ratio: 1 / 1)`. `gap` nei flex: il ripiego a margini per Chromium 80–83 sta in fondo a `css/componenti.css` (`@supports not (color: revert)`): una nuova riga flex con `gap` va aggiunta lì. Il fuoco: `:focus` + `:focus:not(:focus-visible) { outline: none }`.
