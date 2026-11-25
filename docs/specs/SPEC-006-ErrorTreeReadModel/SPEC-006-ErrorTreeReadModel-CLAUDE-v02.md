# SPEC-006 · go-runbook: un read model dell'albero d'errore per output e bozza — v02

- Stato: **bozza**, da approvare.
- Autore: Claude.
- Origine: la revisione architetturale di go-runbook del 20 novembre 2026 (candidato 3, «Error tree read model»),
  scelto dal committente il 21 novembre 2026. Le decisioni D1–D4 sono già prese (§6).
- Rispetto alla v01: accoglie i 4 rilievi del primo giro di Codex (RV-01…RV-04): i costruttori di contesto delle
  famiglie controllano la famiglia prima di costruire la vista e tengono `options` (§3.4); `levels()` conserva i
  livelli raggiunti solo da una discesa (§3.1); dove cambia il testo dei motivi e dove no (§2).

## 1. Perché

### 1.1 Sette module navigano l'albero da soli

Dopo l'esecuzione, l'output e la bozza d'analisi leggono `result.tree` (i nodi) e `result.chains` (le catene, cioè i
percorsi dalla radice a una foglia o a un'interruzione). Ogni module lo fa per conto suo, in
`packages/go-runbook/src/toolkits/common`:

| Module                                                  | Che cosa ricostruisce                                                                                          |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `output/buildErrorChains.ts`                            | mappa id → nodo; nodi di una catena; interruzioni per gruppo; osservazioni del gruppo                          |
| `output/buildCoverageLines.ts` · `unrecognizedLeaves`   | mappa id → nodo; ultimo nodo di ogni catena; conteggio delle interruzioni per motivo                           |
| `output/resultContexts.ts`                              | mappa id → nodo e nodo di una detection (in un `WeakMap` di module); risalita agli antenati                    |
| `output/buildRunbookOutput.ts` · `treeCoverage`         | conteggi per livello (riconosciuti, non riconosciuti, falliti); interruzioni per motivo                        |
| `output/buildRunbookOutput.ts` · `evidenceComplete`     | catene interrotte                                                                                              |
| `output/buildDeclaredOutputContext.ts` · `treeEvidence` | mappa id → nodo; percorso delle chiavi di un nodo (risalita)                                                   |
| `analysis/draft/buildAnalysisDraft.ts`                  | `chainVerdict`, `draftDetections`: due mappe id → nodo, ultimo nodo; `treeNoteEntries`: mappa detection → nodo |

In tutto: la mappa id → nodo è costruita in sei punti e quella detection → nodo in due, la risalita agli antenati in tre, l'ultimo nodo di una
catena in tre, il conteggio delle interruzioni per motivo in due (identici), lo stato riconosciuto/non
riconosciuto/fallito di un nodo in tre. `CORRELATION_KINDS` è definita due volte.

### 1.2 Le divergenze concrete

- **Due testi per lo stesso motivo.** L'interruzione `skipped` si legge «non interrogato, identificatore mancante»
  nella riga della catena (`renderErrorChainLines`) e «identificatore mancante» nella riga di copertura
  (`buildCoverageLines`); entrambe finiscono nella bozza Watchtower.
- **Due regole per gli identificatori osservati.** Per un gruppo di catene (`buildErrorChains.observationsOf`) si
  prendono le detection e la correlazione di tutti i nodi delle catene, a parità di valore vince l'osservazione più
  vecchia, e il risultato è ordinato per tempo. Per una detection (`resultContexts.detectionObservations`) si prendono
  le sue osservazioni e la correlazione del nodo e degli antenati, vince la prima trovata e l'ordine è quello di
  inserimento.
- **Lavoro rifatto.** `buildErrorChains` gira due volte per output (output e bozza), `buildCoverageLines` due volte
  (entrambe nella bozza); `treeNoteEntries` cerca i nodi riconosciuti con `result.tree.some(...)` per ogni id: O(N²).
- **Test.** Nessun test importa `buildCoverageLines`, `renderErrorChainLines` o `resultContexts`; le loro regole si
  provano solo con un run completo di un runbook.

## 2. Che cosa vede chi usa il repository

- **API pubblica di `@pagopa/go-runbook`:** invariata. `buildErrorChains`, `buildCoverageLines`,
  `renderErrorChainLines` e `buildAnalysisDraft` tengono la firma; `RunbookOutputContextBuilderFn` non cambia.
- **Output:** forma e versione invariate. La copertura strutturata (`coverage.interruptions[].reason`,
  `coverage.levels`) tiene i codici dei motivi, come oggi. Cambiano due valori:
  - il testo della riga «Catene interrotte» per `skipped` diventa «non interrogato, identificatore mancante», nelle
    note della bozza inclusa nell'output (`analysis.conclusionNotes`) e nell'avviso che go-analyze-alarm stampa in
    console;
  - le osservazioni di una detection (`outcome.detections[].observations`) hanno, per ogni valore, l'osservazione più
    vecchia fra la detection e gli antenati, e sono ordinate per tempo.
- **Bozza Watchtower:** il testo della riga di copertura cambia come sopra; nient'altro.

## 3. La proposta

### 3.1 Il module `ErrorTreeView`

Un module interno in `toolkits/common/output/tree/`: la classe `ErrorTreeView`, costruita una volta da `tree` e
`chains` di un result, con mappe immutabili. Risponde alle domande che i consumer oggi rifanno:

| Domanda                                                             | Metodo                             |
| ------------------------------------------------------------------- | ---------------------------------- |
| il nodo con questo id                                               | `node(id)`                         |
| il percorso di un nodo, dalla radice                                | `path(id)`                         |
| il percorso delle chiavi (`a > b > c`)                              | `keyPath(id)`                      |
| il nodo di una detection                                            | `nodeOf(detection)`                |
| i nodi di una catena e l'ultimo                                     | `chainNodes(chain)`, `last(chain)` |
| il nodo rappresentativo (ultimo della prima catena)                 | `representative()`                 |
| lo stato di un nodo: riconosciuto, non riconosciuto, fallito        | `statusOf(node)`                   |
| le foglie non riconosciute (distinte)                               | `unrecognizedLeaves()`             |
| le interruzioni per motivo, su tutte le catene                      | `interruptions()`                  |
| i conteggi per livello, con i livelli raggiunti solo da una discesa | `levels(observedErrors)`           |
| se una catena è interrotta                                          | `hasInterruptedChains()`           |

`levels()` è il calcolo di oggi di `treeCoverage`, spostato: per ogni nodo conta il suo livello (nodi, riconosciuti,
non riconosciuti, falliti); il livello di destinazione di una discesa non `queried` esiste anche senza nodi ed è
`lowerBound` (per esempio `pn-delivery` in `pn-delivery-IO_EXP-ApiGwAlarm` quando la discesa è `skipped` per mancanza
di identificatori); le radici sono `lowerBound` quando lo è `observedErrors`.

Senza albero (runbook di sola finestra) la vista è vuota e i consumer tengono il loro comportamento di finestra.

### 3.2 Le osservazioni: una regola

Una funzione pura del module, `mergeObservations(candidates)`, unisce osservazioni candidate: per ogni coppia
tipo/valore vince l'osservazione con `observedAt` più vecchio (un'osservazione senza tempo perde contro una con
tempo); il risultato è ordinato per tempo. La vista dà anche le osservazioni della correlazione di un nodo
(`correlationObservations(node)`, con l'unica `CORRELATION_KINDS`).

- **Gruppo di catene** (`buildErrorChains`): le osservazioni di tutte le detection e la correlazione di ogni nodo delle
  catene, una volta per nodo, come oggi.
- **Detection** (`detectionObservations`): le osservazioni della detection e la correlazione dei nodi del suo
  percorso. Cambia solo la regola di unione (§2).

### 3.3 Un solo testo per i motivi d'interruzione

Una tabella, `ERROR_CHAIN_INTERRUPTION_WORDS`, con i testi di oggi di `renderErrorChainLines`; `buildCoverageLines` la
usa al posto della sua.

### 3.4 I consumer

| Consumer                                                  | Con il read model                                                                                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `buildErrorChains(result)`                                | nodi delle catene e osservazioni dalla vista; i gruppi e i membri come oggi                                                                 |
| `buildCoverageLines(result)`                              | `unrecognizedLeaves()` e `interruptions()` della vista; il resto come oggi                                                                  |
| `resultContexts`                                          | `path`, `nodeOf`, `representative` della vista; sparisce il `WeakMap`                                                                       |
| `buildRunbookOutput` · `treeCoverage`, `evidenceComplete` | `levels()`, `interruptions()`, `hasInterruptedChains()`                                                                                     |
| `buildDeclaredOutputContext` · `treeEvidence`             | `keyPath(id)`                                                                                                                               |
| `buildAnalysisDraft`                                      | `chainVerdict`, `draftDetections`, `treeNoteEntries` leggono `last`, `chainNodes`, `nodeOf`; i nodi riconosciuti della prima catena in O(N) |

**Come si passa.** `buildRunbookOutput` costruisce la vista una volta e la passa a catene, copertura, contesti e
bozza, insieme alle catene e alle righe di copertura già calcolate: `buildErrorChains` e `buildCoverageLines` girano
una volta per output. Le funzioni pubbliche chiamate da sole (`buildErrorChains(result)`, `buildCoverageLines(result)`,
`buildAnalysisDraft(runbook, result)`) costruiscono la vista dentro: O(N) sul numero di nodi. Una variante interna di
ogni funzione accetta la vista già costruita.

I costruttori di contesto delle famiglie, `buildApiGwOutputContext(runbook, result, options?)`,
`buildLambdaOutputContext(runbook, result, options?)` e `buildServiceOutputContext(runbook, result, options?)`,
tengono la firma pubblica, con i loro `options` (`maxRecentLogs`); `RunbookOutputContextBuilderFn` resta a due
argomenti. Oggi chiamano `representativeContext(result)` prima di controllare la famiglia del runbook; con la
proposta controllano prima la famiglia e solo dopo costruiscono la vista. Il dispatcher del catalogo
(`buildCatalogOutputContext`), che li prova in sequenza, costruisce così una vista sola, quella della famiglia del
runbook, oltre a quella dell'output.

### 3.5 Formati e cache

- `RUNBOOK_OUTPUT_SCHEMA_VERSION` e la versione della traccia restano.
- `CACHE_FINGERPRINT_VERSION` di go-watchtower-runbook passa da 16 a 17: la bozza e le osservazioni delle detection
  in cache sono calcolate con le regole di prima.
- Changeset `patch` di `@pagopa/go-runbook` (nessun cambio di API).

## 4. Test e verifica

- **`ErrorTreeView`:** una fixture d'albero (radice con due figli, un nodo fallito, una foglia non riconosciuta, una
  catena interrotta `skipped` con il livello di destinazione senza nodi e `lowerBound`, una `cycle`, due catene sulla
  stessa foglia) contro ogni metodo; vista vuota senza albero.
- **Costruttori di contesto:** un runbook di una famiglia diversa dà `undefined` senza costruire la vista.
- **`mergeObservations`:** stesso valore con tempi diversi (vince il più vecchio), senza tempo, ordine per tempo.
- **`buildCoverageLines`:** foglie non riconosciute distinte, catene interrotte con il testo unico, righe di finestra.
- **`renderErrorChainLines`:** una catena con via in linea, più vie, un'interruzione, un gruppo ripetuto.
- **`resultContexts`:** contesto di un nodo con gli step degli antenati, nodo rappresentativo, osservazioni di una
  detection con un antenato che ha visto prima lo stesso valore.
- **Output e bozza:** i test di oggi di `buildErrorChains`, `buildRunbookOutput` e `buildAnalysisDraft` restano verdi;
  il conteggio dei passaggi di `buildErrorChains` per output è uno.
- **Verifica:** `pnpm check` completo.

## 5. Fuori da questa specifica

- **Le righe degli antenati fra motore e output** (candidato 6 della revisione): `nodeOutputContext` unisce gli step
  degli antenati con una regola sua; renderla uguale a quella del motore è un'altra specifica.
- **L'esecuzione dell'albero nel motore** (candidato 4): la vista legge solo il result.
- **Un read model pubblico:** resta interno (D1); go-analyze-alarm continua a chiamare le funzioni pubbliche.
- **La forma della bozza** (`only`, riga singola, note per catena): le regole di composizione restano quelle di oggi;
  cambiano solo i dati da cui partono.

## 6. Le scelte del committente

- **D1 — Forma (21 novembre 2026).** Module interno; l'API pubblica non cambia.
- **D2 — Condivisione (21 novembre 2026).** La vista si passa esplicitamente; il `WeakMap` di `resultContexts`
  sparisce.
- **D3 — Testi dei motivi (21 novembre 2026).** Una tabella, con il testo lungo di oggi della riga della catena.
- **D4 — Osservazioni (21 novembre 2026).** Una regola di unione: per valore vince l'osservazione più vecchia.
