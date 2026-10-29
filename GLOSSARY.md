# Casa Nostra

Dashboard domestica e familiare pensata per un tablet di casa: raccoglie spesa, agenda, attività, promemoria della casa, meteo e foto di famiglia.

## Organizzazione familiare

**Prodotto**:
Una voce della lista della spesa, con uno stato _da comprare_ o _acquistato_. Il nome è unico nella lista, senza distinguere maiuscole e spazi.
_Evitare_: articolo, item, elemento

**Appuntamento**:
Un evento con titolo, data e ora facoltativa, collocato nel calendario familiare.
_Evitare_: evento, impegno

**Appuntamento imminente**:
Un appuntamento che cade oggi o domani.
_Evitare_: prossimo, urgente

**Attività**:
Una cosa da fare senza data, che a un certo punto diventa _completata_.
_Evitare_: task, compito, to-do

## Casa

**Promemoria casa**:
Una cosa da ricordare legata alla cura della casa (manutenzione, scadenza, controllo periodico), con data e note facoltative. Può essere ricorrente.
_Evitare_: promemoria domestico, scheda casa, reminder

**Categoria**:
Il tipo di un promemoria casa: Manutenzione, Scadenza, Controllo periodico o Altro.

**Intervallo di ricorrenza**:
Il numero di giorni dopo cui un promemoria casa ricorrente si ripresenta. Quando il promemoria viene completato, la sua data avanza di questo intervallo.
_Evitare_: frequenza, periodicità

**Ultimo completamento**:
La data in cui un promemoria casa ricorrente è stato completato l'ultima volta.

## Dashboard e meteo

**Scheda**:
Un riquadro della dashboard dedicato a una sola sezione (Meteo, Agenda, Attività, Spesa, Casa, Foto) o a un avviso. Ogni scheda si disegna da sola: se non riesce, mostra l'errore al proprio interno e le altre continuano a funzionare.
_Evitare_: widget, card, riquadro

**Previsione oraria**:
Nella scheda Meteo, la fila di 6 caselle, una ogni 2 ore a partire dalla prossima ora intera, che copre le 12 ore seguenti anche oltre la mezzanotte. Ogni casella ha ora, emoji, temperatura e, solo dal 20% in su, la probabilità di pioggia.
_Evitare_: previsioni orarie, prossime ore

**Previsione giornaliera**:
Nella scheda Meteo, i 3 giorni a partire da domani, ognuno con giorno, emoji e minima/massima. Il giorno di oggi non ne fa parte: la sua minima e massima stanno nella situazione attuale.
_Evitare_: previsioni dei prossimi giorni, previsione settimanale

## Foto e dati

**Foto**:
Un'immagine scelta a mano dall'utente e conservata solo su questo dispositivo.
_Evitare_: immagine, media

**Presentazione**:
La visualizzazione a schermo intero delle foto, una alla volta, avviata a mano dall'utente.
_Evitare_: slideshow, cornice

**Backup dati**:
Il file JSON versionato con tutti i dati strutturati e le impostazioni. Non contiene le foto.
_Evitare_: salvataggio, export

**Archivio foto**:
Il file ZIP, separato dal backup dati, che contiene le foto.
_Evitare_: backup foto
