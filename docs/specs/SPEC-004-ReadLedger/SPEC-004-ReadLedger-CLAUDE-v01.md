# SPEC-004 · go-runbook: un read ledger per lo stato delle letture — v01

- Stato: **bozza**, da approvare.
- Autore: Claude.
- Origine: la revisione architetturale di go-runbook del 20 novembre 2026 (candidato 1, «Read ledger»), scelto dal
  committente lo stesso giorno. Le decisioni D1–D6 sono già state prese (§6).

## 1. Perché

### 1.1 Una domanda, nove module, tre vocabolari

"Questa lettura è completa, e per chi?" si decide oggi in nove module di `packages/go-runbook/src`:

| Module                                                               | Che cosa decide                                                                               |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `engine/core/RunbookEngine.ts` · `recordStepEvidence`                | registra le lacune dichiarate da uno step                                                     |
| `RunbookEngine.ts` · `failedReadCoverage`, `boundedDetail`           | la lacuna di una lettura fallita, con il dettaglio limitato                                   |
| `RunbookEngine.ts` · `recordTreeRead`                                | le lacune di una lettura raggruppata di un livello                                            |
| `RunbookEngine.ts` · `recordSkipped` (closure)                       | la lacuna di una discesa senza lettore o senza identificatore                                 |
| `RunbookEngine.ts` · `runNodeSteps`                                  | deduplica per `JSON.stringify` le lacune degli step di un nodo, su tutta l'esecuzione         |
| `RunbookEngine.ts` · `execute`                                       | `windowIncomplete = coverage.some((entry) => entry.scoped !== true)`                          |
| `engine/tree/ErrorTreeExecutor.ts`                                   | `readState`, `worstState`, `STATE_SEVERITY`, `DESCENT_SEVERITY`, `combinedState`, `NodeReads` |
| `engine/context/readStepLookupState.ts`, `isStepEvidenceComplete.ts` | lo stato di uno step letto dalla copertura copiata nel contesto                               |
| `toolkits/common/output/buildErrorChains.ts`                         | catene di finestra incomplete se `result.coverage.length > 0`                                 |

Tre tipi descrivono lo stesso concetto (`StepLookupState`, `TreeReadState`, `TreeDescentState`) con tre ordini di
gravità (`PRECEDENCE`, `STATE_SEVERITY`, `DESCENT_SEVERITY`), e le mappature non concordano:

| Motivo della lacuna | `readStepLookupState` (step) | `readState` (livello dell'albero) |
| ------------------- | ---------------------------- | --------------------------------- |
| `saturated`         | `saturated`                  | `saturated`                       |
| `unavailable`       | `unavailable`                | `unavailable`                     |
| `skipped`           | `skipped`                    | `saturated`                       |
| `manual`            | `unavailable`                | `saturated`                       |
| assente             | `unavailable`                | `saturated`                       |

### 1.2 Una lacuna di pochi identificatori passa da tre seam

Una lacuna che riguarda solo alcune richieste (un lotto di execution log fallito o saturo) arriva oggi alle catene
così:

1. `QueryApiGwExecutionLogsStep` marca le voci con `scoped: true`;
2. lo stesso step pubblica la variabile `apiGwExecutionLogIncompleteRequestIds`;
3. `enumerateApiGwRequests` la rilegge e imposta `ErrorNodeSpec.incompleteEvidence` sul nodo.

`scoped` lo legge solo `execute`; `buildErrorChains`, per i runbook senza albero, lo ignora.

### 1.3 Costi e segnali

- La copertura si ricopia nel contesto dopo ogni step (`context = { ...context, coverage: [...state.coverage] }`) e
  la deduplica degli step di nodo serializza tutta la copertura dell'esecuzione a ogni nodo.
- `readStepLookupState` è esportato da `@pagopa/go-runbook` ma nessun module lo chiama.
- Dei 68 rilievi dell'ispezione finale dell'albero d'errore (SPEC-002), 13 riguardavano proprio la propagazione dello
  stato delle letture (F234-25, 26, 33, 34, 41, 56, 60, 61, 62, 63, 66, 67, 68).

## 2. Che cosa vede chi usa il repository

- **Autori di step** (catalogo e famiglie): leggono lo stato di una lettura da `context.reads`, una vista di sola
  lettura, invece che da `readStepLookupState` / `isStepEvidenceComplete`. Una lacuna che riguarda solo alcuni
  identificatori si dichiara con `identifiers` sulla voce di copertura.
- **Autori di casi noti**: le variabili restano le stesse (`<prefix>LookupState`, `<prefix>LogCount`,
  `<prefix>Exclusion.<nome>`). Cambia il valore in due situazioni dei livelli dell'albero (§3.1): una lettura con
  lacuna `skipped` vale `skipped` (oggi `saturated`), una con lacuna `manual` o senza motivo vale `unavailable` (oggi
  `saturated`). Per una condizione `== 'queried'` non cambia nulla.
- **Consumatori dell'output** (go-analyze-alarm, go-rta-check, go-watchtower-runbook): `coverage.sources` resta; le
  voci perdono `scoped` e possono avere `identifiers`. Catene e copertura dell'albero non cambiano forma.
- **Chi rilascia**: `@pagopa/go-runbook` cambia la sua API pubblica (§3.6); serve un changeset con breaking change sul
  prerelease `next`.

## 3. La proposta

### 3.1 Un vocabolario e un ordine

Un solo tipo, `ReadState`: `queried` < `saturated` < `unavailable` < `skipped` < `cycle`. Sostituisce
`StepLookupState`, `TreeReadState` e `TreeDescentState`; `cycle` lo producono solo le discese dell'albero.

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
`identifiers?: ReadonlyArray<string>`: gli identificatori (request id, trace id, …) che la lacuna riguarda. Senza
`identifiers` la lacuna riguarda tutta la lettura. `CoverageEntry`, la voce registrata, porta in più `stepId`.

### 3.3 Il module `ReadLedger`

Una classe in `engine/reads/`, un'istanza per esecuzione, creata da `execute` e passata esplicitamente: niente stato
catturato in closure né condiviso fra esecuzioni.

Registra:

- le lacune di uno step, con il suo id;
- la lettura fallita di uno step o di un lettore, con il dettaglio limitato (oggi `failedReadCoverage` /
  `boundedDetail`);
- l'esito di una lettura di livello per un nodo, anche `skipped` e `cycle` delle discese.

Ogni lacuna si registra una volta per esecuzione: la deduplica è interna, non più per `JSON.stringify`.

Risponde:

| Domanda                                 | Oggi                                                               |
| --------------------------------------- | ------------------------------------------------------------------ |
| stato della lettura di uno step         | `readStepLookupState`, `isStepEvidenceComplete`                    |
| stato di uno step per un identificatore | la variabile `apiGwExecutionLogIncompleteRequestIds`               |
| stato di un livello per un nodo         | `NodeReads.state` e `combinedState` in `ErrorTreeExecutor`         |
| la finestra è incompleta?               | `windowIncomplete` in `execute`, `coverage.length > 0` nell'output |
| un nodo è incompleto?                   | `WorkNode.incompleteEvidence`, `spec.incompleteEvidence`           |
| le voci da riportare                    | `ExecutionState.coverage`, poi `result.coverage` e la traccia      |

Ha uno **scope per nodo**: gli step di un nodo vedono le lacune della finestra più le proprie; ciò che registrano
resta del nodo e compare una volta nelle voci dell'esecuzione.

### 3.4 La vista sul contesto

`RunbookContext.coverage` lascia il posto a `RunbookContext.reads`, una vista di sola lettura del ledger nello scope
giusto (finestra o nodo): stato di uno step, con o senza identificatore, e completezza. Solo il motore registra.
Sparisce la copia della copertura nel contesto dopo ogni step.

I chiamanti di oggi passano alla vista:

| File                                                                                | Oggi                                                           |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `toolkits/common/families/lambda/tree/enumerateLambdaInvocations.ts`                | `isStepEvidenceComplete`                                       |
| `toolkits/common/families/service/tree/enumerateServiceRootErrors.ts`               | `isStepEvidenceComplete`                                       |
| `toolkits/send/families/apigw/tree/enumerateApiGwRequests.ts`                       | `isStepEvidenceComplete`, variabile delle richieste incomplete |
| `inventory/interop/apigw/interop-auth-server-apigw-5xx/AnalyzeAuditFallbackStep.ts` | `isStepEvidenceComplete` ×4                                    |
| `inventory/send/downstream/pn-address-manager-POSTEL-…/VerifyPostelBatchesStep.ts`  | `isStepEvidenceComplete`                                       |

### 3.5 Le lacune per identificatore

`QueryApiGwExecutionLogsStep` dichiara le lacune dei lotti falliti o saturi con gli `identifiers` (i request id del
lotto). `enumerateApiGwRequests` chiede alla vista lo stato dell'execution log per il request id del nodo e imposta
`apiGwExecutionLogMode=incomplete` come oggi. Il ledger sa da sé che il nodo è incompleto: confronta gli
identificatori delle lacune con la correlazione del nodo.

Spariscono: il flag `scoped`, la variabile `apiGwExecutionLogIncompleteRequestIds`, `ErrorNodeSpec.incompleteEvidence`.

### 3.6 L'albero d'errore

- `ErrorTreeExecutor` registra nel ledger l'esito di ogni lettura di livello per il nodo padre e pubblica
  `<prefix>LookupState` dallo stato che il ledger restituisce. Righe lette ed esclusioni `present` restano
  nell'accumulatore dell'esecutore: non sono completezza.
- `readState`, `worstState`, `combinedState` e le tabelle di severità spariscono dall'esecutore.
- `WorkNode.incompleteEvidence` e il campo `incompleteEvidence` di `TreeStepsRun` lasciano il posto alla domanda
  «il nodo è incompleto?». `ErrorTreeNode.incompleteEvidence`, nell'output del motore, resta e si calcola da lì.
- `ErrorTreeExecutorDeps.recordRead` e `recordSkipped` diventano chiamate al ledger.

### 3.7 L'API pubblica di `@pagopa/go-runbook`

| Esce                                                   | Entra                                     |
| ------------------------------------------------------ | ----------------------------------------- |
| `readStepLookupState`, `isStepEvidenceComplete`        | `RunbookContext.reads` (tipo della vista) |
| `StepLookupState`, `TreeReadState`, `TreeDescentState` | `ReadState`                               |
| `StepCoverage.scoped`                                  | `StepCoverage.identifiers`                |
| `RunbookContext.coverage`                              | `RunbookContext.reads`                    |
| `ErrorNodeSpec.incompleteEvidence`                     | —                                         |

Si rinomina ovunque, senza alias. API report rigenerati; changeset con breaking change.

## 4. Test e verifica

- **Test a tabella su `ReadLedger`**, senza motore: ogni motivo dà lo stato di §3.1; più lacune danno la più grave;
  deduplica; scope di nodo che eredita la finestra; lacune per identificatore che toccano solo i nodi che le nominano;
  dettaglio limitato di una lettura fallita; finestra incompleta solo per lacune senza identificatori.
- I test di `ErrorTreeExecutor`, delle famiglie e del catalogo restano verdi; si aggiornano solo quelli che fissano
  i due cambi di valore di §2 (lacune `skipped` e `manual` di un livello).
- Un test di `enumerateApiGwRequests` con un lotto di execution log saturo: solo la richiesta di quel lotto ha
  `apiGwExecutionLogMode=incomplete` e una catena con evidenza incompleta.
- Gate: `bins/check.sh` completo, compresi `dependencies` e `new-classes`; `pnpm api:report:update`.

## 5. Fuori da questa specifica

- Gli altri candidati della revisione (trace identity, read model dell'output, tree investigation, matcher dei casi,
  node view, letture di finestra dell'inventario, …): ognuno avrà la sua specifica se scelto.
- La sottopipeline di `IfBranchStep` / `SwitchBranchStep` continua ad attribuire le lacune allo step di ramo: è il
  candidato 12, con la decisione C2 della revisione precedente.
- Nomi e forma delle variabili dei casi noti e dell'output: non cambiano.

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

Aperte:

- **D7 — `cycle` nel vocabolario.** Proposta: `cycle` entra in `ReadState` come stato più grave, prodotto solo dalle
  discese. Alternativa: resta uno stato della sola discesa, fuori dal ledger.
- **D8 — Finestra incompleta nell'output.** Proposta: `RunbookExecutionResult` porta un booleano calcolato dal ledger,
  e `buildErrorChains` lo usa invece di contare le voci. Alternativa: l'output conta le voci senza `identifiers`.
