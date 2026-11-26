# SPEC-003 · send-dispatch-notifications: requestId delle spedizioni cartacee e conferma del consolidatore — v02

- Stato: **bozza**, da approvare.
- Autore: Claude.
- Origine: la richiesta del committente del 19 novembre 2026; rivista dopo il giro di revisione Codex del 23 novembre 2026.
- Tre modifiche: **A** (categorie del requestId) e **B** (suffisso) sono confermate. **C** (la fase su
  `pn-EcRichiesteMetadati`) è **provvisoria e non confermata**. Si approva a parte e si sviluppa solo dopo la
  conferma dei fatti del §3.3.1.

## 1. Perché

### 1.1 Lo script cerca l'id digitale e non vede la raccomandata semplice

La fase `request-id` legge `pn-Timelines` per IUN. Per ogni categoria cercata prende il `timelineElementId` del
primo elemento, in ordine di `timestamp` (`selectRequestIds`). Oggi le categorie predefinite sono
`PREPARE_ANALOG_DOMICILE` e `PREPARE_DIGITAL_DOMICILE`. Stanno in `DEFAULT_REQUEST_ID_OPTIONS` di go-send e nel
default di `request.id.categories` dello script.

Lo script serve a ricavare l'id delle **spedizioni cartacee**. Con `--request-id-wait any`, il default, una
notifica con domicilio digitale chiude la riga sul primo `PREPARE_DIGITAL_DOMICILE`. La spedizione cartacea che
segue un workflow digitale fallito è la raccomandata semplice (`PREPARE_SIMPLE_REGISTERED_LETTER`), e oggi non viene
mai cercata. `DIGITAL_FAILURE_WORKFLOW` di proposito non è una categoria di fine, proprio perché dopo arriva la
raccomandata semplice. La regola delle categorie però non ne ha mai tenuto conto.

### 1.2 L'id della timeline non è l'id con cui la spedizione arriva al consolidatore

Una spedizione arriva a pn-external-channels, e da lì al consolidatore, con l'id della timeline seguito da
`.PCRETRY_<n>`, il tentativo di pn-paper-channel. Gli esempi del committente:

- `PREPARE_ANALOG_DOMICILE.IUN_PHAT-KLZW-GKHZ-202611-Q-1.RECINDEX_0.ATTEMPT_0` (timeline) →
  `PREPARE_ANALOG_DOMICILE.IUN_PHAT-KLZW-GKHZ-202611-Q-1.RECINDEX_0.ATTEMPT_0.PCRETRY_0`
- `PREPARE_SIMPLE_REGISTERED_LETTER.IUN_ADJZ-VTJR-GEQL-202611-X-1.RECINDEX_0` (timeline) →
  `PREPARE_SIMPLE_REGISTERED_LETTER.IUN_ADJZ-VTJR-GEQL-202611-X-1.RECINDEX_0.PCRETRY_0`

Oggi la colonna `requestId` contiene l'id della timeline e il suffisso si aggiunge a mano. La modalità `direct` lo
mette già: il template predefinito è `PNMAN.GO-{runId}.{rowKey}.PCRETRY_0`.

### 1.3 Nessuna prova che la spedizione sia partita davvero

Una riga `REQUEST_ID_FOUND` dimostra che SEND ha preparato la spedizione. Non dice se pn-external-channels l'ha
inoltrata al consolidatore o a un mock, come succede negli ambienti di test. Quest'informazione sta nella tabella
DynamoDB `pn-EcRichiesteMetadati` dell'account confinfo, nel campo `statusRequest`. Può arrivare anche 10 minuti
dopo.

## 2. Che cosa vede chi usa lo script

- **Categorie predefinite**: `PREPARE_ANALOG_DOMICILE` e `PREPARE_SIMPLE_REGISTERED_LETTER`. Chi vuole ancora l'id
  digitale lo chiede con `--request-id-categories`.
- **Notifiche digitali riuscite**: senza spedizione cartacea la riga chiude `REQUEST_ID_NOT_FOUND` /
  `WORKFLOW_ENDED:DIGITAL_SUCCESS_WORKFLOW`. Non è un problema: non porta l'uscita a `2` e il riepilogo la conta a
  parte (D9).
- **Colonna `requestId`** con il suffisso `.PCRETRY_0` per default.
  - `--request-id-append-suffix=false` toglie il suffisso.
  - `--request-id-suffix <testo>` lo sostituisce con un altro.
- **Ripresa**: categorie e suffisso fanno parte dell'identità del run. Un `--resume` con valori diversi viene
  rifiutato; per riprendere un run scritto prima di questa modifica si ripetono i valori di allora, come dice il
  messaggio d'errore.
- **Report**: la colonna `digitalRequestId` diventa `simpleRegisteredLetterRequestId` (D3).
- **Nuova fase facoltativa `ec-status`** (parte C), solo se richiesta e solo insieme a `request-id`, o da sola in
  un resume:

  ```bash
  pnpm send:dispatch:notifications:dev --env <ambiente> --input-file <file> \
    --phases send,verify,request-id,ec-status --aws-profiles <profilo-core>,<profilo-confinfo> --dry-run=false
  ```

  Per ogni riga con il requestId, lo script aspetta e poi interroga `pn-EcRichiesteMetadati`. Lo stato finale della
  riga diventa `EC_SENT` (inoltrata al consolidatore), `EC_MOCK` (inoltrata a un mock) o `EC_NOT_CONFIRMED`.

## 3. La proposta

### 3.1 A · Categorie del requestId

- Le categorie predefinite diventano `['PREPARE_ANALOG_DOMICILE', 'PREPARE_SIMPLE_REGISTERED_LETTER']`, in
  quest'ordine di priorità. Cambiano in due punti:
  - `DEFAULT_REQUEST_ID_OPTIONS.categories` (`packages/go-send/src/dispatch/requestId/defaultRequestIdOptions.ts`);
  - `defaultValue` di `request.id.categories` (`scripts/send/send-dispatch-notifications/src/config.ts`).
- Il resto della regola non cambia: primo elemento per categoria in ordine di `timestamp`, `select`
  (`per-category`/`priority`), `wait` (`any`/`all`), categorie di fine.
- Le categorie di fine restano le stesse:
  - con `DIGITAL_SUCCESS_WORKFLOW` la riga chiude `REQUEST_ID_NOT_FOUND` / `WORKFLOW_ENDED:DIGITAL_SUCCESS_WORKFLOW`,
    ed è giusto così: non c'è spedizione cartacea;
  - `DIGITAL_FAILURE_WORKFLOW` continua a non chiudere, quindi lo script aspetta la raccomandata semplice.
- **Uscita e riepilogo** (D9). Oggi `exitCodeFor` tratta ogni `REQUEST_ID_NOT_FOUND` come un problema. Con le
  nuove categorie un lotto di sole notifiche digitali riuscite uscirebbe `2`, come un lotto rimasto in attesa della
  raccomandata. Una riga `REQUEST_ID_NOT_FOUND` con motivo `WORKFLOW_ENDED:DIGITAL_SUCCESS_WORKFLOW` non è un
  problema:
  - il progresso la conta a parte (`requestIdNotExpected`) e `exitCodeFor` non la considera;
  - `displaySummary` mostra la riga «Senza spedizione cartacea (workflow digitale riuscito)»;
  - resta fuori da `--output-only-success`, perché non ha un requestId da consegnare;
  - le altre fini di workflow (`REQUEST_REFUSED`, `NOTIFICATION_CANCELLED`, `ANALOG_FAILURE_WORKFLOW`,
    `COMPLETELY_UNREACHABLE`) e `TIMEOUT` restano problemi.
- `acceptanceFromTimeline` aggiunge `PREPARE_SIMPLE_REGISTERED_LETTER` alle prove di accettazione: SEND la scrive
  solo dopo aver accettato la notifica. `PREPARE_DIGITAL_DOMICILE` resta fra le prove, perché è un fatto di SEND e
  non dipende dalle categorie scelte.
- Report (`materializeRun`): `digitalRequestId` diventa `simpleRegisteredLetterRequestId`
  (`requestIds['PREPARE_SIMPLE_REGISTERED_LETTER']`). `analogRequestId` e `requestIds` restano.
- **Errore residuo**: `applyJournalEntry` su `REQUEST_ID_FOUND` mantiene l'errore della voce precedente. Una riga
  andata in `TIMEOUT` con `TIMELINE_QUERY_FAILED` e poi trovata in ripresa resta nel riepilogo degli errori e porta
  `errorCode` nel report. `REQUEST_ID_FOUND` toglie l'errore, come `SENT` e `ACCEPTED`.
- I commenti che parlano di «stessa regola del `jq`» e di «analog, then digital», e il README («Cosa fa» al punto 7,
  la tabella dei parametri), si aggiornano alla nuova regola.

### 3.2 B · Suffisso del requestId

**Parametri**

| Parametro                    | Tipo   | Default      | Descrizione                                            |
| ---------------------------- | ------ | ------------ | ------------------------------------------------------ |
| `--request-id-append-suffix` | BOOL   | `true` (D2)  | aggiunge il suffisso agli id trovati                   |
| `--request-id-suffix`        | STRING | `.PCRETRY_0` | il suffisso; se attivo, non vuoto, senza spazi né `\|` |

Con un parametro BOOL distinto il suffisso si toglie senza passare una stringa vuota. Il testo resta comunque
personalizzabile. La `|` è il separatore degli id nella colonna e in `requestIds` del report: un suffisso che la
contiene è un errore d'uso.

**Dove si applica**

- In `selectRequestIds`, che resta una funzione pura. `RequestIdSelectionOptions` acquista `suffix: string` (`''` =
  nessun suffisso). Ogni id per categoria diventa `timelineElementId + suffix`. Il valore della colonna si compone
  dagli id con il suffisso: `per-category` li unisce con `|`, `priority` prende il primo.
- Il suffisso vale per **tutte** le categorie cercate (D1). Con le categorie predefinite sono tutte cartacee.
- Journal, stato della riga, output e report portano gli id con il suffisso, sia in `requestId` sia in
  `requestIds`. Così c'è un solo valore vero, quello che usa pn-external-channels. L'id della timeline si ottiene
  togliendo il suffisso.
- La modalità `direct` non cambia: il requestId viene dal template e la fase `request-id` lì non si applica.

**Ripresa: categorie e suffisso nell'identità del run**

- Due chiavi nuove nell'identità del run, con ambito `always`, accanto a `directRequestIdTemplate`:
  - `requestIdCategories`: le categorie effettive, unite con `,` nell'ordine dato;
  - `requestIdSuffix`: il suffisso effettivo, `''` se `--request-id-append-suffix=false`.
- In modalità `direct` entrambe valgono `''`: la fase `request-id` non si applica, e un resume `direct` non dipende
  da questi parametri.
- Così un `--resume` con categorie o suffisso diversi viene rifiutato, e lo stesso output non mescola righe trovate
  con due regole. È un cambiamento: oggi le categorie possono cambiare in ripresa.
- Un `run.json` scritto prima di questa modifica non ha le due chiavi. Si leggono con i valori di allora:
  `PREPARE_ANALOG_DOMICILE,PREPARE_DIGITAL_DOMICILE` e `''` in `e2e`, `''` e `''` in `direct`. Il resume non viene
  rifiutato in blocco: per riprendere un run `e2e` vecchio si aggiungono
  `--request-id-categories PREPARE_ANALOG_DOMICILE,PREPARE_DIGITAL_DOMICILE --request-id-append-suffix=false`, come
  dice il messaggio d'errore. Serve un ritocco di `savedRunIdentity`, che oggi rifiuta qualunque chiave mancante.
- Il messaggio d'errore della ripresa elenca le categorie e il suffisso fra i parametri da ripetere.

**Piano e riepilogo**: `displayPlan` mostra categorie e suffisso della fase `request-id`.

### 3.3 C · Fase `ec-status` su `pn-EcRichiesteMetadati` (provvisoria)

#### 3.3.1 Da confermare prima di svilupparla

1. **Chiave**: la partition key `requestId` vale `<x-pagopa-extch-cx-id>~<requestId con suffisso>`. Per le
   spedizioni di pn-paper-channel il prefisso è `pn-cons-000`. Esempio:
   `pn-cons-000~PREPARE_SIMPLE_REGISTERED_LETTER.IUN_ADJZ-VTJR-GEQL-202611-X-1.RECINDEX_0.PCRETRY_0`. Va confermato
   anche che la tabella non abbia una sort key e che ogni requestId abbia un solo record, da leggere con `GetItem`, e
   non più record da leggere con `Query`. Il repository riporta la chiave con il prefisso solo come esempio di
   `Query`.
2. **Valori di `statusRequest`**:
   - `sent` quando la spedizione è stata inoltrata al consolidatore;
   - `null` o assente quando è andata a un mock.
   - Da chiarire: che valore c'è **prima** dell'esito? Il record manca, `statusRequest` è `null`, o c'è un altro
     valore (es. `booked`)? Il confronto con `sent` è esatto o senza distinzione di maiuscole?
3. **Tempi**: l'esito arriva entro circa 10 minuti dalla preparazione della spedizione.

Il punto 2 decide la regola di chiusura (D4). Se `null` vuol dire sia «mock» sia «non ancora», un mock si riconosce
solo allo scadere del timeout.

#### 3.3.2 Comportamento

- **Fase facoltativa** `ec-status` in `--phases`, solo in modalità `e2e` (D8). Le combinazioni ammesse:
  - insieme a `request-id` nella stessa sessione: le righe arrivano alla fase a `REQUEST_ID_FOUND`;
  - da sola (`--phases ec-status`) in un `--resume`: le righe già `REQUEST_ID_FOUND` o `EC_NOT_CONFIRMED`.

  Ogni altra combinazione con `ec-status` (`send,verify,ec-status`, `verify,ec-status`, `ec-status` senza
  `--resume`) è un errore d'uso, segnalato prima di qualunque invio. Senza la fase `request-id` una sessione non ha
  righe con il requestId: non si importa il requestId dall'input (§5).

- **Id da leggere**: solo quelli delle categorie cartacee (`PREPARE_ANALOG_DOMICILE`,
  `PREPARE_SIMPLE_REGISTERED_LETTER`) presenti in `requestIds` della riga, già con il suffisso. Una riga trovata
  solo con categorie non cartacee non passa alla fase e resta `REQUEST_ID_FOUND`. La fase richiede il suffisso:
  `ec-status` con `--request-id-append-suffix=false` è un errore d'uso, perché l'id della timeline non è la chiave
  di `pn-EcRichiesteMetadati`.

- **Tempi**, con un intervallo fisso e non un backoff, perché la richiesta è «ogni X minuti»:

  | Parametro                   | Default (D7) | Significato                                                    |
  | --------------------------- | ------------ | -------------------------------------------------------------- |
  | `--ec-status-initial-delay` | `10m`        | primo controllo, contato da `requestIdFoundAt` della riga      |
  | `--ec-status-interval`      | `2m`         | intervallo fra i controlli successivi                          |
  | `--ec-status-timeout`       | `30m`        | tempo massimo per riga, contato dall'inizio dei suoi controlli |

  Il timeout si conta come nella fase `request-id`: dall'inizio dei controlli della riga nella sessione, non da un
  istante salvato. In ripresa una riga trovata da più di `initial-delay` si controlla subito, e ha di nuovo tutto il
  timeout: una ripresa dopo `aws sso login` non scade al primo controllo.

- **Lettura**: un `GetItem` su `pn-EcRichiesteMetadati` con chiave `<ecClientId>~<id>` per ogni id da leggere.
  `ecClientId` viene dal parametro `--ec-client-id`, che c'è già per la modalità `direct` (default `pn-cons-000`,
  l'header `x-pagopa-extch-cx-id`) e che in `e2e` oggi non si usa. Il nome della tabella è una costante di go-send.

- **Esiti per id**: ogni lettura dà `SENT` (`statusRequest` = `sent`), `MOCK` (record con `statusRequest` `null` o
  assente), `MISSING` (nessun record), `STATUS:<valore>` o `FAILED` (lettura fallita). Fino al timeout conta
  l'ultima lettura di ogni id.

- **Esiti della riga** (nuovi stati, dopo `REQUEST_ID_FOUND`):

  | Stato              | Quando                                                       | `ecStatusReason`                                           |
  | ------------------ | ------------------------------------------------------------ | ---------------------------------------------------------- |
  | `EC_SENT`          | ogni id è `SENT`                                             | `SENT`                                                     |
  | `EC_MOCK`          | allo scadere del timeout (D4), ogni id è `MOCK`              | `MOCK`                                                     |
  | `EC_NOT_CONFIRMED` | allo scadere del timeout, in ogni altro caso, misti compresi | `RECORD_NOT_FOUND`, `STATUS:<valore>`, `MIXED` o `TIMEOUT` |

  `MIXED` quando gli id hanno esiti diversi (es. `SENT` e `MOCK`); `TIMEOUT` quando l'ultima lettura di un id era
  fallita, con l'errore `EC_QUERY_FAILED`, come fa la fase `request-id` con `TIMELINE_QUERY_FAILED`.
  `ecStatusRequest` conserva l'esito di ogni id (`<id>=<esito>`, uniti con `|`), così la riga si può verificare.

- **Errori**: `EC_SENT` ed `EC_MOCK` tolgono l'errore della riga, come `SENT`, `ACCEPTED` e `REQUEST_ID_FOUND`. Una
  riga prima `EC_NOT_CONFIRMED` con `EC_QUERY_FAILED` e poi confermata non resta fra gli errori.

- **Account confinfo e identità**: il profilo è uno dei `--aws-profiles`, validati da GOScript, e il client viene da
  `script.aws.clients`. Quale profilo sia di confinfo lo dice l'ambiente, con una nuova chiave
  `confinfoAwsProfile` accanto ad `awsProfile`, che resta il profilo per `pn-Timelines` (D6). Con un solo profilo e
  la sola fase `ec-status` (un resume) si usa quello. Con più profili e senza la chiave il run si ferma con un
  errore d'uso. Con `ec-status` attiva il controllo dell'identità vale anche per `env` ed `endpoint`, come per
  `send` e `verify`, e l'identità acquista `ecClientId`, con ambito `ec-status`. Così un resume non legge la tabella
  di un altro ambiente o con un altro prefisso.
- **Credenziali scadute**: come nella fase `request-id`. La fase si ferma senza chiudere righe; dopo `aws sso login`
  si continua con `--resume`, uscita `2`.
- **Preflight**: un `GetItem` su una chiave inesistente controlla credenziali e accesso alla tabella prima di
  qualunque invio, come la lettura di prova di `pn-Timelines`.
- **Concorrenza**: un pool proprio della fase, con il limite di `--dynamodb-concurrency`.

#### 3.3.3 Modello e codice

- **go-send**, nuova cartella `dispatch/ecStatus/`:
  - `EcStatusStage`: stessa struttura di `RequestIdStage` (`PendingTasks`, `GOConcurrencyPool`, attese
    interrompibili, rilevazione delle credenziali scadute);
  - `EcMetadataSource`: interfaccia di una lettura, finta nei test;
  - `DynamoEcMetadataSource`: usa `AWSDynamoDBService.getItem` di `@pagopa/go-aws/dynamodb`, già dipendenza di
    go-send.
- **Collegamento**: `RequestIdStage` acquista un `onFound` che passa la riga a `EcStatusStage` se ha id cartacei,
  come `VerifyStage` con `onAccepted`. `DispatchRun` svuota le fasi in ordine: verify, request-id, ec-status.
- **Journal**:
  - eventi `EC_STATUS_SENT`, `EC_STATUS_MOCK` ed `EC_STATUS_NOT_CONFIRMED`;
  - campi `ecStatusRequest` (esiti per id) ed `ecStatusReason`;
  - `RowState` acquista `ecStatusRequest`, `ecStatusReason`, `ecCheckedAt` ed `ecChecks`; `applyJournalEntry` li
    applica e toglie l'errore su `EC_STATUS_SENT` ed `EC_STATUS_MOCK`.
- **`decideRowAction`**:
  - l'accettazione non nota con `verify` attiva porta sempre a `verify` per primo, anche per gli stati `EC_*`;
  - `REQUEST_ID_FOUND` passa a `ec-status` se la fase è attiva e la riga ha id cartacei;
  - `EC_NOT_CONFIRMED` torna a `ec-status` se la fase è attiva, altrimenti si salta;
  - `EC_SENT` ed `EC_MOCK` si saltano.
- **Script**:
  - `ec-status` in `PHASES` e `DispatchPhaseName`;
  - i parametri del §3.3.2, con il rifiuto in `--mode direct`, delle combinazioni di fasi non ammesse e del suffisso
    spento;
  - `createSessionOptions` costruisce le opzioni della fase;
  - `runIdentity`: `env` ed `endpoint` controllati anche con `ec-status`, chiave `ecClientId`;
  - `ProgressReporter`: `consolidatore N sent / M mock / K in attesa`;
  - `outcomeCounts`: i tre stati fra quelli inviati;
  - `displaySummary`: codice d'uscita `2` con righe `EC_NOT_CONFIRMED`;
  - `--output-only-success` include `EC_SENT` ed `EC_MOCK` (D5).
- **Report**: colonne `ecStatusRequest`, `ecStatusReason`, `ecCheckedAt`, `ecChecks`.
- **Ambienti**: `confinfoAwsProfile` in `parseEnvironmentsFile`, in `EnvironmentDefinition` e in
  `environments.example.yaml`.

### 3.4 Fasi dello sviluppo

| Fase | Contenuto                                         | Quando                                                                                            |
| ---- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| F1   | A e B: toccano entrambe la sola fase `request-id` | dopo l'approvazione di questa specifica (D1–D3, D9)                                               |
| F2   | C: fase `ec-status`                               | dopo la conferma del §3.3.1 e le scelte D4–D8; versione nuova della specifica se cambia la regola |

## 4. Test e verifica

**F1**

- `selectRequestIds`:
  - con le nuove categorie predefinite, una timeline digitale fallita dà l'id di `PREPARE_SIMPLE_REGISTERED_LETTER`;
  - il suffisso si applica per categoria e nel valore unito con `|`, anche con `priority`;
  - con `suffix: ''` gli id sono quelli della timeline.
- `RequestIdStage`: il journal registra gli id con il suffisso in `requestId` e `requestIds`.
- `applyJournalEntry`: `REQUEST_ID_FOUND` dopo un `TIMEOUT` con `TIMELINE_QUERY_FAILED` toglie l'errore, dal vivo e
  in replay.
- `acceptanceFromTimeline`: `PREPARE_SIMPLE_REGISTERED_LETTER` vale come prova di accettazione.
- `materializeRun`: colonna `simpleRegisteredLetterRequestId`.
- `exitCodeFor` e `displaySummary`: un lotto di sole righe `WORKFLOW_ENDED:DIGITAL_SUCCESS_WORKFLOW` esce `0` e le
  conta a parte; `TIMEOUT` e le altre fini di workflow escono `2`.
- `runIdentity`:
  - un `run.json` `e2e` senza le due chiavi vale le categorie di allora e `''`;
  - categorie o suffisso diversi rifiutano il resume con il nome della chiave;
  - un resume `direct` di un run vecchio, con i parametri invariati, non viene rifiutato.
- `validateConfig`: `--request-id-append-suffix` attivo con il suffisso vuoto, con spazi o con `|` è un errore
  d'uso.
- Prova manuale in un ambiente di test con una notifica analogica e una con domicilio digitale che fallisce: gli id
  dell'output coincidono con quelli che si vedono in `pn-EcRichiesteMetadati`, togliendo il prefisso `pn-cons-000~`.

**F2**

- `EcStatusStage` con il `VirtualClock`:
  - ritardo iniziale e intervallo;
  - `sent` porta a `EC_SENT`;
  - `null` fino al timeout porta a `EC_MOCK`;
  - un record assente porta a `EC_NOT_CONFIRMED`/`RECORD_NOT_FOUND`;
  - un valore diverso porta a `STATUS:<valore>`;
  - due id con esiti diversi portano a `MIXED`, con l'esito di ogni id in `ecStatusRequest`;
  - una lettura fallita e poi riuscita entro il timeout non lascia l'errore;
  - le credenziali scadute fermano la fase senza chiudere righe.
- La chiave è composta con `ecClientId` e `~`; si leggono solo gli id delle categorie cartacee.
- `decideRowAction` e `applyJournalEntry` per i tre stati, compreso il passaggio da `EC_NOT_CONFIRMED` con
  `EC_QUERY_FAILED` a `EC_SENT`.
- Ripresa: una riga trovata da più del ritardo si controlla subito e ha di nuovo tutto il timeout.
- `validateConfig`: le combinazioni di fasi non ammesse e il suffisso spento sono errori d'uso prima dell'invio.
- `runIdentity`: un resume con sola `ec-status` e un altro `env` o `ecClientId` viene rifiutato.

**Sempre**: `pnpm check` (build, test, coverage, lint, format, knip) e README aggiornato.

## 5. Fuori da questa specifica

- **Tentativi successivi di pn-paper-channel** (`PCRETRY_1`, …): il suffisso è fisso per tutto il run. Seguire i
  nuovi tentativi è un altro lavoro.
- **Notifiche con più destinatari**: la regola prende il primo elemento per categoria, qualunque sia il
  `RECINDEX`. È il comportamento di oggi e non cambia.
- **Timeout della fase `request-id`** sul percorso digitale: in produzione la raccomandata semplice può arrivare
  dopo le 2 h predefinite. La riga va in `TIMEOUT` e `--resume` la riprende; si può alzare
  `--request-id-timeout`. Non cambia.
- **Nuovi default per un run vecchio**: un run scritto prima di questa modifica si riprende con le categorie e il
  suffisso di allora, anche se non ha ancora trovato nessun id. Far dipendere l'identità dal contenuto del journal
  complica la ripresa per un caso di transizione; il messaggio d'errore dice che cosa ripetere.
- **Ricalcolo degli id già trovati** con le nuove categorie: si fa con un run nuovo.
- **Verifica dell'account AWS fisico** di confinfo prima delle letture: il profilo viene dall'ambiente, e l'ambiente
  fa parte dell'identità del run.
- **RequestId dall'input** per la fase `ec-status` (righe mai passate da `request-id`): non serve per il flusso
  richiesto.
- **Altri campi di `pn-EcRichiesteMetadati`** (eventi, stati di avanzamento del consolidatore): fuori, finché C
  non è confermata.

## 6. Le scelte del committente

| Id  | Scelta                                                                              | Proposta dell'autore                                                                                                                                                                    |
| --- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Il suffisso vale per tutte le categorie cercate o solo per quelle cartacee?         | **Tutte**: con le categorie predefinite sono cartacee. Chi cerca di nuovo `PREPARE_DIGITAL_DOMICILE` toglie il suffisso con `--request-id-append-suffix=false`.                         |
| D2  | Il suffisso è attivo per default?                                                   | **Sì**, `.PCRETRY_0`: l'id utile a valle è quello di pn-external-channels. Cambia l'output di chi oggi usa l'id della timeline.                                                         |
| D3  | `digitalRequestId` del report si rinomina o si affianca?                            | **Si rinomina** in `simpleRegisteredLetterRequestId`. `requestIds` contiene comunque tutte le categorie trovate.                                                                        |
| D4  | (C) Quando un `statusRequest` `null` chiude la riga come mock?                      | **Allo scadere del timeout**: `null` potrebbe voler dire anche «non ancora». Se il §3.3.1 conferma che prima dell'esito il record manca, si chiude al primo `null` letto.               |
| D5  | (C) `EC_MOCK` è un successo, cioè uscita `0` e presenza in `--output-only-success`? | **Sì**: negli ambienti di test il mock è il comportamento atteso. Il riepilogo le conta a parte.                                                                                        |
| D6  | (C) Come si sceglie il profilo confinfo fra i `--aws-profiles`?                     | **Nuova chiave `confinfoAwsProfile` dell'ambiente**, come `awsProfile` per `pn-Timelines`. Nessun parametro di profilo dedicato.                                                        |
| D7  | (C) Default dei tempi                                                               | Ritardo iniziale `10m`, intervallo `2m`, timeout `30m` per riga.                                                                                                                        |
| D8  | (C) La fase vale anche in modalità `direct`, dove il requestId viene dal template?  | **No, per ora**: la verifica in `direct` è ancora aperta. Si può aggiungere dopo senza toccare il modello.                                                                              |
| D9  | Una notifica digitale riuscita, senza spedizione cartacea, è un problema del run?   | **No**: uscita `0`, contata a parte nel riepilogo, fuori da `--output-only-success` perché non ha un requestId. Le altre fini di workflow e il `TIMEOUT` restano problemi (uscita `2`). |
