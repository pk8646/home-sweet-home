# Casa Nostra

Dashboard domestica in italiano per il tablet di casa: data e ora, meteo, agenda, attività, lista della spesa, promemoria della casa e foto di famiglia, in una sola schermata. Si apre nel browser e si può aggiungere alla schermata Home come un'app.

- **Privata**: tutti i dati restano nel browser del dispositivo. Niente account, niente server, niente sincronizzazione, nessun tracker o pubblicità.
- **Offline**: dopo la prima apertura funziona anche senza Internet. Solo il meteo ha bisogno della rete; senza rete mostra l'ultimo dato ricevuto con l'orario di aggiornamento.
- **Senza compilazione**: HTML, CSS e JavaScript così come sono. Basta pubblicare i file su GitHub Pages.

Pensata per un tablet Android 9 (Mediacom M-SP7DY, 2 GB di RAM) ma funziona anche su smartphone e PC con un browser Chromium recente (Chrome 80 o successivo).

> Questo documento spiega come pubblicare l'app. La pubblicazione la fa a mano il proprietario del repository: finché non hai seguito i passi qui sotto, il sito non è online.

## Pubblicazione su GitHub Pages

### 1. Crea il repository pubblico

1. Accedi a [github.com](https://github.com) con il tuo account.
2. In alto a destra scegli **+** → **New repository**.
3. Come nome scrivi `home-sweet-home` (l'indirizzo finale dipende da questo nome).
4. Scegli **Public**: GitHub Pages gratuito pubblica solo i repository pubblici.
5. Premi **Create repository**.

Il repository è pubblico: chiunque può leggerne il codice. I tuoi dati (spesa, agenda, foto, backup) non finiscono mai nel repository, perché restano nel browser del tablet.

### 2. Carica i file

Carica tutti i file e le cartelle di questo progetto nella radice del repository, sul ramo `main`:
`index.html`, `sw.js`, `manifest.webmanifest`, le cartelle `css/`, `js/`, `icone/` e il resto.

- **Dal sito di GitHub**: nella pagina del repository scegli **Add file** → **Upload files**, trascina il contenuto della cartella (non la cartella stessa), scrivi una descrizione e premi **Commit changes**.
- **Con git**, dalla cartella del progetto:

  ```
  git remote add origin https://github.com/pk8646/home-sweet-home.git
  git push -u origin main
  ```

`index.html` deve stare nella radice del repository, non in una sottocartella. Non caricare mai foto, file di backup (`casa-nostra-backup-*.json`) o archivi (`*.zip`): il file `.gitignore` li esclude già quando usi git.

### 3. Apri Settings → Pages

Nella pagina del repository scegli **Settings** (in alto) e poi **Pages** nel menu a sinistra.

### 4. Scegli Deploy from a branch → `main` → `/(root)`

1. In **Build and deployment** → **Source** scegli **Deploy from a branch**.
2. In **Branch** scegli `main` e la cartella `/(root)`.
3. Premi **Save**.

La prima pubblicazione richiede qualche minuto. Puoi seguirla nella scheda **Actions** del repository.

### 5. Recupera l'indirizzo

Quando la pubblicazione è finita, in cima alla pagina **Settings → Pages** compare l'indirizzo del sito:

```
https://pk8646.github.io/home-sweet-home/
```

Aprilo dal PC per controllare che la dashboard compaia. L'app funziona sotto questo sottopercorso perché tutti i percorsi dei file sono relativi.

### 6. Apri l'app sul tablet

1. Sul tablet apri **Chrome** (il browser consigliato).
2. Scrivi l'indirizzo `https://pk8646.github.io/home-sweet-home/`.
3. Al primo avvio compare la scheda **Benvenuti**, che spiega dove stanno i dati. Premi **Imposta nome e località** per personalizzare la dashboard, oppure **Ho capito**.

La località predefinita del meteo è Fiumicino. Per cambiarla: **Impostazioni** → **Località del meteo**, cerca la città per nome oppure inserisci latitudine e longitudine. L'app non usa mai il GPS.

### 7. Aggiungi l'app alla schermata Home

1. In Chrome, con l'app aperta, tocca il menu **⋮** in alto a destra.
2. Scegli **Installa app** oppure **Aggiungi a schermata Home** (il nome cambia con la versione di Chrome).
3. Conferma. Sulla schermata Home compare l'icona **Casa Nostra**.

Aperta dall'icona, l'app occupa tutto lo schermo, senza la barra degli indirizzi.

Per usare il tablet come pannello sempre visibile: **Impostazioni** → **Schermo** → **Mantieni lo schermo acceso**. Questa opzione compare solo se il browser la supporta.

### 8. Verifica il Service Worker

Il Service Worker è il componente che salva l'app sul tablet e la fa partire anche senza Internet.

- **Prova rapida**: apri l'app una volta con Internet, chiudila, attiva la modalità aereo e riaprila. Spesa, agenda, attività, promemoria e foto devono funzionare; il meteo mostra l'ultimo dato con l'orario.
- **Sul tablet**: in Chrome apri `chrome://serviceworker-internals` e cerca `https://pk8646.github.io/home-sweet-home/`. Lo stato deve essere **ACTIVATED** e **RUNNING** (o **STOPPED**, che è normale quando l'app è inattiva).
- **Dal PC** (DevTools remoti): attiva sul tablet **Opzioni sviluppatore** → **Debug USB**, collega il cavo, apri sul PC `chrome://inspect/#devices` in Chrome e premi **inspect** sotto la scheda di Casa Nostra. In **Application** → **Service workers** deve comparire `sw.js` attivo; in **Application** → **Cache storage** c'è la cache `casa-nostra-<versione>`.

Se il Service Worker non c'è, l'app funziona lo stesso con Internet, ma non si apre offline. Il Service Worker richiede HTTPS: GitHub Pages lo fornisce.

### 9. Aggiorna l'app dopo una modifica

A ogni modifica dei file pubblicati:

1. Apri `sw.js` e aumenta di uno la costante `VERSIONE` (ad esempio da `'1'` a `'2'`).
2. Se hai aggiunto un file nuovo (script, foglio di stile, icona), aggiungilo anche all'elenco `RISORSE` in `sw.js`, con lo stesso percorso usato in `index.html`.
3. Carica i file modificati su GitHub come al passo 2 e attendi la pubblicazione.

Alla successiva apertura con Internet il tablet scarica la nuova versione e mostra l'avviso **Nuova versione disponibile** con il pulsante **Ricarica**. L'aggiornamento cancella solo la vecchia copia dei file dell'app: spesa, agenda, attività, promemoria, impostazioni e foto restano intatti.

Senza l'aumento di `VERSIONE` il tablet riceve comunque i file nuovi appena ha rete, ma la copia offline resta mista e l'avviso non compare: aumentala sempre.

### 10. Backup e ripristino

I dati stanno solo nel browser del tablet. Si perdono se cancelli i dati del sito o della app Chrome, se disinstalli Chrome o se ripristini il tablet. Proteggili con due file, entrambi da **Impostazioni**:

| File | Contiene | Esporta | Reimporta |
|---|---|---|---|
| **Backup dati** (`casa-nostra-backup-AAAA-MM-GG.json`) | spesa, agenda, attività, promemoria casa e impostazioni. **Non contiene le foto.** | **Backup dati** → **Esporta il backup dati** | **Backup dati** → **Importa un backup dati** |
| **Archivio foto** (`casa-nostra-foto-AAAA-MM-GG.zip`) | tutte le foto della galleria | **Archivio foto** → **Esporta archivio foto** | **Archivio foto** → **Importa archivio foto** |

- **Importare il backup dati** mostra prima un riepilogo (data del backup e numero di elementi per tipo) e chiede conferma. Poi **sostituisce** tutti i dati attuali, in un colpo solo: se il file non è valido, è di un'altra app o di una versione futura, viene rifiutato e i dati attuali restano identici. Le foto non vengono toccate.
- **Importare l'archivio foto** aggiunge le foto mancanti e salta quelle già presenti, poi mostra un resoconto (importate, già presenti, non leggibili). Non elimina mai foto.
- Nella sezione **Backup dati** trovi la data dell'ultimo backup. Se hai dei dati e non fai un backup da più di 30 giorni, la dashboard mostra un avviso discreto, che si può rimandare di 7 giorni.
- **Ripristino iniziale**: **Impostazioni** → **Ripristino iniziale** → **Cancella tutto**, poi scrivi `CANCELLA` per confermare. Cancella tutto da questo dispositivo, foto comprese. Fai prima un backup dati e un archivio foto.

Per spostare i dati su un altro dispositivo: esporta i due file, copiali sul nuovo dispositivo e importali lì. Non c'è sincronizzazione automatica: i due dispositivi restano poi indipendenti.

## Conservare i backup fuori dal tablet

Un backup che resta solo sul tablet si perde insieme al tablet. Dopo ogni esportazione i file sono nella cartella **Download** del tablet: copiane almeno una copia altrove.

- **PC via USB**: collega il tablet al PC con il cavo, scegli sul tablet **Trasferimento file**, apri la cartella **Download** dal PC e copia i file `casa-nostra-backup-*.json` e `casa-nostra-foto-*.zip`.
- **Email a te stesso**: dall'app **File** (o **Download**) del tablet, condividi il file e invialo per email al tuo indirizzo. Adatto al backup dati, che è piccolo; l'archivio foto può superare il limite degli allegati.
- **Cloud personale**: carica i file su Google Drive o su un altro servizio di cui ti fidi, condividendoli dall'app **File**.

Non caricare mai backup o foto nel repository GitHub: il repository è pubblico.

Se l'esportazione dell'archivio foto fallisce per mancanza di memoria (succede con molte centinaia di foto su un tablet con 2 GB di RAM), scarica le foto una per una dalla vista ingrandita della galleria, oppure copia dal PC le foto originali che avevi scelto.

## Limiti noti

- **Nessuna sincronizzazione**: ogni dispositivo ha i suoi dati. Tablet e telefono non si vedono a vicenda.
- **I dati dipendono dal browser**: cancellare i dati di navigazione o del sito, disinstallare Chrome o ripristinare il tablet li elimina. L'unica protezione sono i file di backup.
- **Il backup dati non contiene le foto**: per le foto serve l'archivio foto.
- **L'importazione del backup dati sostituisce**, non unisce: i dati presenti prima vengono rimpiazzati da quelli del file.
- **L'archivio foto si costruisce in memoria**: con moltissime foto l'esportazione può fallire sul tablet (vedi sopra). L'importazione accetta solo gli archivi creati da Casa Nostra, non ZIP compressi creati da altri programmi.
- **Foto ridimensionate**: le foto più grandi di 1200 pixel sul lato lungo vengono ridotte e salvate in JPEG. L'originale resta solo dove l'hai preso.
- **Meteo**: richiede Internet ed è fornito da [Open-Meteo](https://open-meteo.com), a cui arrivano solo le coordinate della località (o il nome cercato). Si aggiorna al massimo ogni 30 minuti; il pulsante **Aggiorna** funziona al massimo una volta al minuto.
- **Nessuna notifica**: l'app non suona e non invia avvisi. Appuntamenti e promemoria si vedono solo aprendo l'app.
- **Mantieni lo schermo acceso** funziona solo con l'app aperta e in primo piano, e solo nei browser che lo supportano.
- **Spazio**: il browser assegna al sito una parte dello spazio libero del tablet. Se finisce, l'app mostra "spazio esaurito" e la foto non viene salvata.

## Checklist da provare a mano sul Mediacom

I test automatici girano su Chrome per PC con le dimensioni dello schermo simulate. Questi punti si verificano solo sul tablet vero. Annota l'esito di ciascuno.

**Browser e versione**
- [ ] In Chrome apri **⋮** → **Impostazioni** → **Informazioni su Chrome** e annota la versione (serve la 80 o successiva).
- [ ] Il browser predefinito del tablet apre l'app senza errori; se non è Chrome, usa Chrome.

**Prestazioni**
- [ ] Dall'icona, la dashboard compare in pochi secondi.
- [ ] Passare da una sezione all'altra con la barra di navigazione è fluido.
- [ ] Il tasto **indietro** di Android torna alla sezione precedente.
- [ ] Con 30–50 foto la galleria scorre senza blocchi e la presentazione cambia foto ogni 10 secondi senza scatti.
- [ ] In orizzontale la dashboard usa più colonne, in verticale una sola; nessuna pagina scorre di lato.

**Installazione PWA**
- [ ] Il menu di Chrome propone **Installa app** o **Aggiungi a schermata Home**.
- [ ] L'icona sulla Home è nitida e si chiama Casa Nostra.
- [ ] Aperta dall'icona, l'app è a schermo intero, senza barra degli indirizzi.
- [ ] In modalità aereo l'app si apre dall'icona e spesa, agenda, attività, promemoria e foto funzionano.
- [ ] Dopo la pubblicazione di una nuova `VERSIONE`, entro un paio di aperture compare **Nuova versione disponibile**, e dopo **Ricarica** i dati ci sono ancora.

**Wake Lock (schermo acceso)**
- [ ] In **Impostazioni** → **Schermo** l'opzione **Mantieni lo schermo acceso** è presente (se manca, il browser non la supporta: annotalo).
- [ ] Con l'opzione attiva, lasciando il tablet fermo oltre il tempo di spegnimento dello schermo, lo schermo resta acceso.
- [ ] Dopo essere passati a un'altra app e tornati su Casa Nostra, lo schermo resta ancora acceso.

**Foto dalla fotocamera**
- [ ] **Foto** → **Aggiungi foto** apre la scelta dei file; scegliendo la fotocamera si scatta una foto e questa compare nella galleria.
- [ ] Una foto scattata (in genere più grande di 1200 pixel) viene ridotta e si apre ingrandita senza ritardi evidenti.
- [ ] Scegliendo più foto dalla galleria del tablet vengono aggiunte tutte.
- [ ] L'app non ha mai chiesto permessi per fotocamera, posizione o notifiche.

**Backup**
- [ ] **Esporta il backup dati** ed **Esporta archivio foto** salvano i file nella cartella **Download**.
- [ ] I file si copiano sul PC via USB.
- [ ] Dopo **Ripristino iniziale**, importando i due file tornano dati e foto.

## Per chi sviluppa

Comandi di sviluppo e test, architettura e convenzioni sono in [`CLAUDE.md`](CLAUDE.md). Il vocabolario del dominio è in [`GLOSSARY.md`](GLOSSARY.md), le decisioni architetturali in [`docs/adr/`](docs/adr/).
