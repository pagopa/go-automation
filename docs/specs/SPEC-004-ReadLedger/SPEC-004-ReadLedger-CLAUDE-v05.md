# SPEC-004 · go-runbook: un read ledger per lo stato delle letture — v05

- Stato: **bozza**, da approvare.
- Autore: Claude.
- Origine: la revisione architetturale di go-runbook del 20 novembre 2026 (candidato 1, «Read ledger»), scelto dal
  committente lo stesso giorno.
- Rispetto alla v04: accoglie i 4 rilievi del quarto giro di Codex (RL4-01…RL4-04): una sola regola per i request
  id dell'execution log (§3.2, §3.8), la deduplica per step e riferimento (§3.3), l'instradamento fallito che declassa
  solo una discesa `queried` come oggi (§3.7), il mascheramento degli export di go-analyze-alarm (§3.9).

## 1. Perché

### 1.1 Una domanda, nove module, tre vocabolari

"Questa lettura è completa, e per chi?" si decide oggi in nove module di `packages/go-runbook/src`:

| Module                                                               | Che cosa decide                                                                       |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `engine/core/RunbookEngine.ts` · `recordStepEvidence`                | registra le lacune dichiarate da uno step                                             |
| `RunbookEngine.ts` · `failedReadCoverage`, `boundedDetail`           | la lacuna di una lettura fallita, con il dettaglio limitato                           |
| `RunbookEngine.ts` · `recordTreeRead`                                | traccia e lacune di un lotto letto per un livello                                     |
| `RunbookEngine.ts` · `recordSkipped` (closure)                       | la lacuna di una discesa senza lettore o senza identificatore                         |
| `RunbookEngine.ts` · `runNodeSteps`                                  | deduplica per `JSON.stringify` le lacune degli step di un nodo, su tutta l'esecuzione |
| `RunbookEngine.ts` · `execute`                                       | `windowIncomplete = coverage.some((entry) => entry.scoped !== true)`                  |
| `engine/tree/ErrorTreeExecutor.ts`                                   | `readState`, `worstState`, `STATE_SEVERITY`, `DESCENT_SEVERITY`, `combinedState`      |
| `engine/context/readStepLookupState.ts`, `isStepEvidenceComplete.ts` | lo stato di uno step letto dalla copertura copiata nel contesto                       |
| `toolkits/common/output/buildErrorChains.ts`                         | catene di finestra incomplete se `result.coverage.length > 0`                         |

Tre tipi descrivono lo stesso concetto (`StepLookupState`, `TreeReadState`, `TreeDescentState`) con tre ordini di
gravità, e le mappature non concordano:

| Motivo della lacuna | `readStepLookupState` (step) | `readState` (livello dell'albero) |
| ------------------- | ---------------------------- | --------------------------------- |
| `saturated`         | `saturated`                  | `saturated`                       |
| `unavailable`       | `unavailable`                | `unavailable`                     |
| `skipped`           | `skipped`                    | `saturated`                       |
| `manual`            | `unavailable`                | `saturated`                       |
| assente             | `unavailable`                | `saturated`                       |

### 1.2 Una lacuna di pochi identificatori passa da tre seam

Una lacuna che riguarda solo alcune richieste (un lotto di execution log fallito o saturo) arriva oggi alle catene
così: `QueryApiGwExecutionLogsStep` marca le voci con `scoped: true` e pubblica la variabile
`apiGwExecutionLogIncompleteRequestIds`; `enumerateApiGwRequests` la rilegge e imposta
`ErrorNodeSpec.incompleteEvidence`. `scoped` lo legge solo `execute`; `buildErrorChains`, senza albero, lo ignora.

### 1.3 Costi e segnali

- La copertura si ricopia nel contesto dopo ogni step e la deduplica degli step di nodo serializza tutta la copertura
  dell'esecuzione a ogni nodo.
- `readStepLookupState` è esportato da `@pagopa/go-runbook` ma nessun module lo chiama.
- Dei 68 rilievi dell'ispezione finale dell'albero d'errore (SPEC-002), 13 riguardavano la propagazione dello stato
  delle letture (F234-25, 26, 33, 34, 41, 56, 60, 61, 62, 63, 66, 67, 68).

## 2. Che cosa vede chi usa il repository

- **Autori di step**: leggono lo stato di una lettura da `context.reads`, vista di sola lettura, invece che da
  `readStepLookupState` / `isStepEvidenceComplete`. Una lacuna di alcuni identificatori si dichiara con
  `identifiers` (tipizzati) sulla voce di copertura.
- **Autori di casi noti**: le variabili restano le stesse. Cambia il valore di `<prefix>LookupState` solo per una
  lettura di livello con lacuna `skipped` (diventa `skipped`, oggi `saturated`) o con lacuna `manual` o senza motivo
  (diventa `unavailable`, oggi `saturated`). Per una condizione `== 'queried'` non cambia nulla.
- **Consumatori dell'output**: `schemaVersion` passa a `3.0.0`; `coverage.sources` resta, le voci perdono `scoped` e
  possono avere `identifiers`.
  `RunbookExecutionResult` ha un booleano nuovo, `windowIncomplete`. Le voci RTA già in cache si ricalcolano (§3.9).
- **Chi rilascia**: `@pagopa/go-runbook` cambia API pubblica (§3.10); changeset con breaking change sul prerelease
  `next`.

## 3. La proposta

### 3.1 Un vocabolario e un ordine

Un solo tipo, `ReadState`: `queried` < `saturated` < `unavailable` < `skipped` < `cycle`. Sostituisce
`StepLookupState`, `TreeReadState` e `TreeDescentState`. `cycle` lo producono solo le discese (D7): non diventa mai una
voce di copertura, perché nessuna query è stata eseguita.

Una sola mappatura dal motivo della lacuna allo stato:

| Motivo          | Stato         |
| --------------- | ------------- |
| `saturated`     | `saturated`   |
| `unavailable`   | `unavailable` |
| `manual`        | `unavailable` |
| `skipped`       | `skipped`     |
| assente         | `unavailable` |
| lettura fallita | `unavailable` |

Una lettura con più lacune ha lo stato della più grave. Le esclusioni dei livelli restano `present` / `absent` /
`unknown`, con `absent` solo per `queried`.

### 3.2 La voce di copertura

`StepCoverage`, ciò che uno step o un lettore restituisce, sostituisce `scoped?: boolean` con
`identifiers?: ReadonlyArray<ReadIdentifier>`. `ReadIdentifier` è l'attuale `TreeReadIdentifier` (`kind`, `value`),
rinominato perché non riguarda più solo l'albero. Oggi l'unico step che dichiara lacune per identificatore è
`QueryApiGwExecutionLogsStep`, con identificatori `requestId`; nessuna fonte multipla è coinvolta, quindi
l'identificatore non porta la fonte.

- Senza `identifiers` la lacuna riguarda tutta la lettura che la dichiara. Una lista vuota vale come assente.
- Un identificatore `requestId` segue la regola dei request id dell'execution log, oggi duplicata in
  `QueryApiGwExecutionLogsStep` e `enumerateApiGwRequests` (`/^[A-Za-z0-9-]{1,128}$/`): diventa una sola, nel motore,
  usata dalla query, dalla correlazione API Gateway, dal ledger e dal confronto senza albero (§3.8). Gli altri tipi
  seguono le regole di forma e lunghezza della correlazione dei nodi; un identificatore
  che non le rispetta non si registra, e la lacuna vale per tutta la lettura. La regola, oggi
  `toolkits/common/parsing/correlation/safeCorrelationValue.ts`, passa nel motore e il toolkit la riusa.
- Due identificatori coincidono se coincidono `kind` e `value` (nella forma canonica del suo tipo).

`CoverageEntry`, la voce registrata, porta in più `stepId`.

### 3.3 Il module `ReadLedger`

Una classe in `engine/reads/`, un'istanza per esecuzione, creata da `execute` e passata esplicitamente.

**Registra**:

- le lacune di uno step, con il suo id;
- la lettura fallita di uno step o di un lettore, con il dettaglio limitato (oggi `failedReadCoverage` /
  `boundedDetail`);
- l'esito di ogni tentativo di lettura di una discesa (§3.6), compresi `skipped` e `cycle`.

**Attribuzione e deduplica sono due cose distinte.** Una lacuna si associa a ogni scope che la dichiara o la riusa,
anche se la stessa voce è già stata registrata da un altro scope: due nodi che riusano la sonda condivisa di
versioning sono entrambi incompleti. Le voci esposte (`result.coverage`, traccia) sono invece uniche **per step e
riferimento**: la stessa voce dello stesso step, riusata da più scope (la sonda condivisa restituisce lo stesso
oggetto a ogni nodo), compare una volta; due step diversi danno sempre due voci, anche con lo stesso oggetto. Il
contratto degli step: una lettura nuova restituisce voci nuove, e riusare lo stesso oggetto vuol dire condividere la
stessa lettura. Così due letture indipendenti restano due voci anche con lo stesso errore, sia negli step che
eseguono più query (`QueryLambdaAcrossAccountsStep`) sia nei lotti dei livelli.

**Risponde**:

| Domanda                                 | Oggi                                                               |
| --------------------------------------- | ------------------------------------------------------------------ |
| stato della lettura di uno step         | `readStepLookupState`, `isStepEvidenceComplete`                    |
| stato di uno step per un identificatore | la variabile `apiGwExecutionLogIncompleteRequestIds`               |
| stato di una discesa                    | `WorkDescent.state`, usato dalle catene                            |
| stato di un livello per un nodo         | `NodeReads.state` e `combinedState` in `ErrorTreeExecutor`         |
| la finestra è incompleta?               | `windowIncomplete` in `execute`, `coverage.length > 0` nell'output |
| un nodo è incompleto?                   | `WorkNode.incompleteEvidence`, `spec.incompleteEvidence`           |
| le voci da riportare                    | `ExecutionState.coverage`, poi `result.coverage` e la traccia      |

Lo stato di uno step per un identificatore è il più grave fra le lacune che nominano quell'identificatore **e**
quelle senza identificatori, con l'ordine di §3.1. Una lettura fallita del tutto contribuisce `unavailable` per ogni
suo identificatore; se lo stesso step ha anche una lacuna `skipped` senza identificatori, lo stato è `skipped`. Per distinguere una
lacuna mirata, la vista ha una seconda domanda, «lo step ha una lacuna che nomina questo identificatore?»; la usa
l'enumeratore API Gateway (§3.5).

**Scope.** Il ledger ha uno scope di finestra, uno per ogni nodo e uno temporaneo per ogni pseudo-nodo
d'instradamento (§3.7). Uno scope vede le lacune proprie e quelle degli scope da cui discende; ciò che registra resta
suo e compare una volta nelle voci dell'esecuzione.

### 3.4 La vista sul contesto

`RunbookContext.coverage` lascia il posto a `RunbookContext.reads`, una vista di sola lettura del ledger nello scope
giusto: stato di uno step, con o senza identificatore, e completezza. Solo il motore registra; sparisce la copia della
copertura nel contesto dopo ogni step.

- `reads` è obbligatoria. `createInitialContext` crea una vista vuota (ogni lettura vale `queried`); i contesti
  costruiti a mano, oggi solo nei test (per esempio `interopInventory.test.ts`), passano a `createTestContext` o
  aggiungono la vista vuota esportata dal motore.
- I test che oggi iniettano `coverage` nel contesto (per esempio `AnalyzeAuditFallbackStep.test.ts`) passano a un
  helper di test che costruisce la vista da una lista di lacune; il fallback audit deve restare `unknown` con una
  lettura satura.

Chiamanti di oggi da migrare: `enumerateLambdaInvocations.ts`, `enumerateServiceRootErrors.ts`,
`enumerateApiGwRequests.ts`, `AnalyzeAuditFallbackStep.ts` (×4), `VerifyPostelBatchesStep.ts`.

### 3.5 L'execution log per richiesta

`QueryApiGwExecutionLogsStep` dichiara **ogni** lacuna di un lotto, compresa una pagina di risultati non letta di
un lotto che ha risposto, con gli identificatori `requestId` di quel lotto. Solo quando nessun lotto risponde la
lacuna è senza identificatori. La modalità dell'execution log di ogni nodo richiesta, letta dallo stop terminale, resta quella di oggi in
ogni percorso:

| Situazione                                                                                                                   | `apiGwExecutionLogMode` del nodo | Dichiarato da                                                |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------ |
| lettura non configurata o saltata                                                                                            | quella della finestra            | lo step, come oggi                                           |
| nessun lotto ha risposto                                                                                                     | `unavailable` (della finestra)   | lo step: lacuna senza identificatori                         |
| richiesta senza request id                                                                                                   | `no-request-id`                  | l'enumeratore, come oggi                                     |
| almeno un lotto ha risposto, e una lacuna nomina la richiesta (lotto fallito, saturo o con pagine perse, anche se è l'unico) | `incomplete`                     | l'enumeratore, se una lacuna dello step nomina il request id |
| lotto della richiesta completo                                                                                               | `queried` (della finestra)       | lo step                                                      |

La voce `skipped` delle richieste senza request id (`withSkippedRequests`) resta senza identificatori: non nomina le
richieste con request id lette per intero, che in modalità terminale continuano a fermarsi. Come oggi, rende
incompleta la finestra e quindi tutte le catene: è un eccesso di prudenza che questa specifica non cambia (§5).

Spariscono il flag `scoped`, la variabile `apiGwExecutionLogIncompleteRequestIds` e
`ErrorNodeSpec.incompleteEvidence`. Il ledger sa da sé che un nodo è incompleto confrontando gli identificatori delle
lacune con la correlazione del nodo (§3.2).

### 3.6 Discese, livelli e lotti dell'albero

- **Per discesa e per tentativo.** `ErrorTreeExecutor` registra nel ledger l'esito di ogni tentativo di lettura di
  ogni discesa, associando la discesa al lotto fisico che l'ha letta. Lo stato della discesa è il peggiore dei suoi
  tentativi: un secondo tentativo saturo con un identificatore nuovo segna la discesa originaria. Una lacuna di un
  lotto senza identificatori riguarda tutte le discese del lotto, come stabilisce oggi `TreeLevelReadResult`, mai la
  finestra.
- **Per livello.** Lo stato di un livello per un nodo è il peggiore delle sue discese verso quel livello; da lì si
  pubblica `<prefix>LookupState`. Righe lette ed esclusioni `present` restano nell'accumulatore dell'esecutore: non
  sono completezza.
- **Catene.** Le catene usano lo stato della singola discesa, non quello del livello: con due discese allo stesso
  livello, una completa e una fallita, solo la catena della seconda è incompleta. In `buildTreeChains`, una discesa
  con figli rende incompleti i figli per ogni stato diverso da `queried` (oggi solo `saturated` e `unavailable`): una
  lettura `skipped` che ha comunque restituito righe non dà più catene complete. Una discesa senza figli si
  interrompe con il motivo di oggi (`skipped`, `unavailable`, `incomplete`, `cycle`); `coverage.levels[].lowerBound`
  resta `true` per ogni stato diverso da `queried`.
- **Traccia dei lotti.** Ogni lotto fisico, compresi secondi tentativi e fallimenti, resta uno `StepTrace` con tempi,
  righe, stato e diagnostica, come fa oggi `recordTreeRead`: la telemetria CloudWatch dell'output non cambia. Un lotto
  condiviso da più padri è una sola voce di traccia. `ErrorTreeExecutorDeps.recordRead` resta per la traccia e
  delega al ledger la completezza; `recordSkipped` diventa una chiamata al ledger.
- `readState`, `worstState`, `combinedState` e le tabelle di severità spariscono dall'esecutore.

### 3.7 Gli pseudo-nodi d'instradamento

Gli step di un pseudo-nodo d'instradamento (righe di contesto, `enumerateServiceErrors`) girano in uno scope
temporaneo, figlio dello scope del nodo padre. Se falliscono o dichiarano una lacuna e la discesa che li ha prodotti
era `queried`, la discesa diventa `unavailable`, come oggi; una discesa già incompleta (`saturated`, `unavailable`,
`skipped`) conserva il suo stato e il suo motivo d'interruzione. Il livello si ripubblica sul padre: righe contate ed esclusioni `present`
restano, le altre esclusioni passano a `unknown`, come oggi. Le rotte promosse conservano la propagazione
dell'evidenza incompleta (`incompleteVia`) dallo stato delle letture attraversate. `branchOutcome` mantiene la
precedenza di `diagnosed`.

### 3.8 La finestra incompleta e le catene senza albero

`RunbookExecutionResult` porta `windowIncomplete` (D8): `true` se c'è almeno una lacuna senza identificatori dichiarata
nello scope di finestra. Entra nel contratto pubblico e nelle fixture dei risultati (`createTestExecutionResult`).

- **Con l'albero**, le catene partono da `windowIncomplete` invece di ricalcolarlo, e il ledger aggiunge l'evidenza
  incompleta dei nodi.
- **Senza albero**, `buildErrorChains` segna una rilevazione come incompleta se `windowIncomplete` è vero, o se una
  lacuna per identificatore nomina uno degli identificatori osservati dalla rilevazione, o se la rilevazione non ha
  osservazioni utilizzabili ed esiste almeno una lacuna per identificatore. Utilizzabile vuol dire dello stesso
  `kind` delle lacune (oggi `requestId`) e valido per la regola unica dei request id di §3.2: una rilevazione con
  solo un `traceId`, o con un request id non valido (per esempio `req.42`), prende il ripiego prudente; una con un request id valido e
  diverso resta completa.
- **La completezza complessiva** (`coverage.complete` e la distinzione fra `inconclusive` e `unknown-case` in
  `buildRunbookOutput`) resta calcolata a parte, su tutte le voci e sulle catene interrotte come oggi.

### 3.9 Formato dell'output e cache RTA

- Le voci di `coverage.sources` e della traccia pubblicano gli identificatori così come registrati: sono request id
  validi, al massimo quelli di un lotto di execution log. Le catene si calcolano sui dati del ledger, non sulla
  proiezione pubblica.
- Gli export di go-analyze-alarm (`saveExecutionOutput`, `saveExecutionTrace`) continuano a mascherare i nomi dei
  profili AWS su tutto il JSON: il mascheramento ha la precedenza, e un identificatore uguale al nome di un profilo
  locale può comparire mascherato nel solo file esportato. Le catene e l'output in memoria non cambiano.
- Togliere `scoped` e aggiungere `identifiers` cambia i due formati JSON che serializzano le voci di copertura, ognuno
  con la sua versione: `RUNBOOK_OUTPUT_SCHEMA_VERSION` (output) e `schemaVersion` di `RunbookExecutionTrace`
  (traccia) passano da `2.0.0` a `3.0.0`, con le fixture che li fissano. I report di go-rta-check non serializzano le
  voci di copertura e non cambiano versione.
- `CACHE_FINGERPRINT_VERSION` di `go-watchtower-runbook` passa da 14 a 15: le voci in cache prima di questa specifica
  si ricalcolano. Un test verifica che una voce con la versione precedente non venga riusata.

### 3.10 L'API pubblica di `@pagopa/go-runbook`

| Esce                                                   | Entra                                     |
| ------------------------------------------------------ | ----------------------------------------- |
| `readStepLookupState`, `isStepEvidenceComplete`        | `RunbookContext.reads` (tipo della vista) |
| `StepLookupState`, `TreeReadState`, `TreeDescentState` | `ReadState`                               |
| `TreeReadIdentifier`                                   | `ReadIdentifier`                          |
| `StepCoverage.scoped`                                  | `StepCoverage.identifiers`                |
| `RunbookContext.coverage`                              | `RunbookContext.reads`                    |
| `ErrorNodeSpec.incompleteEvidence`                     | —                                         |
| —                                                      | `RunbookExecutionResult.windowIncomplete` |

Si rinomina ovunque, senza alias. Si rigenerano gli API report di tutti i sottopercorsi che espongono questi tipi
(non solo quello principale); changeset con breaking change.

## 4. Test e verifica

- **Test a tabella su `ReadLedger`**, senza motore:
  - ogni motivo dà lo stato di §3.1; più lacune danno la più grave;
  - identificatori: stessi `kind` e `value` coincidono, tipi diversi con lo stesso valore no, lista vuota vale come
    assente, valore non valido rende la lacuna di tutta la lettura;
  - stato per identificatore che comprende le lacune senza identificatori; la domanda sulle lacune mirate no;
  - attribuzione: due scope che riusano la stessa voce sono entrambi incompleti, con una sola voce esposta; due
    letture indipendenti con lo stesso errore danno due voci, anche nello stesso step; due step che restituiscono lo
    stesso oggetto danno due voci;
  - scope di nodo e di instradamento che ereditano la finestra;
  - dettaglio limitato di una lettura fallita.
- **Albero**:
  - due discese dello stesso padre verso lo stesso livello, una completa e una fallita: solo una catena incompleta,
    `<prefix>LookupState` del padre `unavailable`;
  - secondo tentativo saturo con identificatore nuovo: la discesa originaria è incompleta;
  - lettura di livello `skipped` con righe: catene dei figli incomplete;
  - pseudo-nodo d'instradamento con step fallito: discesa `unavailable`, esclusioni `unknown`, nessuna foglia completa
    per il caso `bff-external-registries-read-timeout`; con la discesa già `saturated` o `skipped`, stato e motivo
    d'interruzione restano quelli di prima.
- **Execution log in modalità terminale**: un lotto riuscito, uno saturo, una richiesta senza request id; un lotto
  unico con righe e una pagina non letta (le sue richieste `incomplete`, proseguono); nessun lotto risponde e una
  richiesta è senza request id (stato del ledger `skipped`, `apiGwExecutionLogMode` del nodo con request id
  `unavailable`). Le modalità di ogni nodo sono quelle di §3.5.
- **Sonda condivisa di versioning**: due nodi che la riusano, entrambi con evidenza incompleta, una sola voce di
  copertura e una sola telemetria.
- **Senza albero**: una lacuna per un identificatore osservato da una rilevazione rende incompleta solo quella catena;
  una rilevazione con solo un `traceId` o con `req.42` è incompleta; una con un request id valido e diverso resta
  completa.
- **Cache RTA**: una voce con la versione 14 si ricalcola.
- **Formati**: `schemaVersion` `3.0.0` nell'output e nella traccia; in go-rta-check il nuovo output e il mancato riuso
  della cache precedente.
- I test esistenti restano verdi; si aggiornano solo quelli che fissano i cambi di valore di §2 e le fixture che
  iniettano `coverage` nel contesto.
- Gate: `bins/check.sh` completo, compresi `dependencies` e `new-classes`; `pnpm api:report:update`.

## 5. Fuori da questa specifica

- Gli altri candidati della revisione architetturale: ognuno avrà la sua specifica se scelto.
- La sottopipeline di `IfBranchStep` / `SwitchBranchStep` continua ad attribuire le lacune allo step di ramo
  (candidato 12, con la decisione C2 della revisione precedente).
- Nomi e forma delle variabili dei casi noti: non cambiano.
- La lacuna `skipped` delle richieste senza request id rende incompleta tutta la finestra, come oggi: attribuirla ai
  soli nodi senza request id chiederebbe al ledger un riferimento alle righe dell'access log.
- Lacune per identificatore in altre famiglie (Lambda, service): nessuno step ne ha bisogno oggi; quando servirà,
  l'identificatore avrà anche la fonte.

## 6. Le scelte del committente

Decise il 20 novembre 2026:

- **D1 — Mappatura.** Ordine unico `queried < saturated < unavailable < skipped`, `manual` = `unavailable`; nei livelli
  dell'albero una lacuna `skipped` vale `skipped`. → Accolta.
- **D2 — Lacune per identificatore.** Gli identificatori sulla voce di copertura sostituiscono `scoped`, la variabile
  delle richieste incomplete e `spec.incompleteEvidence`. → Accolta.
- **D3 — Forma.** Una classe per esecuzione, creata da `execute` e passata esplicitamente. → Accolta.
- **D4 — API pubblica.** Le domande del ledger sostituiscono le funzioni pubbliche, senza alias; breaking change sul
  prerelease. → Accolta.
- **D5 — Accesso.** Una vista di sola lettura su `RunbookContext.reads`; registra solo il motore. → Accolta.
- **D6 — Nodi.** Il ledger ha uno scope per nodo e tiene anche lo stato dei livelli per nodo. → Accolta.
- **D7 — `cycle` nel vocabolario.** `cycle` entra in `ReadState` come stato più grave, prodotto solo dalle discese.
  → Accolta (opzione A).
- **D8 — Finestra incompleta.** `RunbookExecutionResult.windowIncomplete`, calcolato dal ledger, e l'output lo usa.
  → Accolta (opzione A).
