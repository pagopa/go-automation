# SPEC-004 · Read ledger — registro delle revisioni

## Origine (20 novembre 2026)

Revisione architetturale di `packages/go-runbook`: dodici candidati di deepening, con raccomandazione principale il
read ledger. Il committente sceglie il candidato 1 e, nell'esame delle decisioni, accoglie le proposte D1–D6; chiede
una specifica rivista da Codex prima dello sviluppo.

## Versioni

| Versione | File                                | SHA256                                                             |
| -------- | ----------------------------------- | ------------------------------------------------------------------ |
| v01      | `SPEC-004-ReadLedger-CLAUDE-v01.md` | `2541e7906d537892bbff1fd79265a3c0609bab1de6516d6776c0d51149c0849c` |
| v02      | `SPEC-004-ReadLedger-CLAUDE-v02.md` | `46e4c6495cfe50e448ff8eceb592dd4fa9980b9c6c21242305d485a92362a60c` |
| v03      | `SPEC-004-ReadLedger-CLAUDE-v03.md` | `41cd42aaa9da90a77ccdd69a144035b31da84d9d7a17689f56381bad009b00e9` |
| v04      | `SPEC-004-ReadLedger-CLAUDE-v04.md` | `430d0dc29fec3d4e1ce392e7414094c42cfe0d8225f1d71e305ad752e653c379` |
| v05      | `SPEC-004-ReadLedger-CLAUDE-v05.md` | `3cf19a6560766b88e52186868bf54adf2654c37ec0070a146084c2ce39c83211` |
| v06      | `SPEC-004-ReadLedger-CLAUDE-v06.md` | `2d4bdbf843226981a0cf49ae4516c12ef78aa8b93816e7a1126fad042dfd5c17` |

## Scelte del committente sulle decisioni aperte (20 novembre 2026)

- **D7 — `cycle` nel vocabolario.** Opzione A: `cycle` entra in `ReadState` come stato più grave, prodotto solo dalle
  discese; un solo ordine per tutto il motore.
- **D8 — Finestra incompleta nell'output.** Opzione A: `RunbookExecutionResult` porta un booleano calcolato dal
  ledger e l'output lo usa invece di contare le voci di copertura.

Entrambe entrano nella v02, con le correzioni del primo giro di revisione.

## Primo giro di revisione Codex (20 novembre 2026)

Esito: **REVISE**, 11 rilievi (3 high, 8 medium). Tutti accolti nella v02.

| Rilievo                                               | Correzione nella v02                                                                                                                                                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RL-01 high, modalità dell'execution log per richiesta | tabella delle modalità per ogni percorso (§3.5); lo stato per identificatore ignora le lacune senza identificatori, così la voce `skipped` delle richieste senza request id non tocca quelle lette per intero |
| RL-02 high, stato della singola discesa               | esiti per discesa e per tentativo, legati al lotto fisico; livello = peggiore delle discese; le catene usano la discesa (§3.6)                                                                                |
| RL-03 high, pseudo-nodi d'instradamento               | scope temporaneo per l'instradamento; la discesa diventa `unavailable`, esclusioni ripubblicate, `incompleteVia` e precedenza di `diagnosed` conservate (§3.7)                                                |
| RL-04, `skipped` con righe                            | ogni stato diverso da `queried` rende incompleti i figli; `cycle` senza voce di copertura (§3.1, §3.6)                                                                                                        |
| RL-05, identificatori senza tipo                      | `ReadIdentifier` tipizzato con `source?`, confronto esatto, lista vuota = assente (§3.2)                                                                                                                      |
| RL-06, deduplica e attribuzione                       | separate: attribuzione a ogni scope, deduplica delle voci esposte per identità con il lotto (§3.3)                                                                                                            |
| RL-07, catene senza albero e completezza complessiva  | regole per le catene senza albero; completezza complessiva calcolata a parte; `windowIncomplete` nel contratto e nelle fixture (§3.8)                                                                         |
| RL-08, traccia dei lotti                              | ogni lotto fisico resta uno `StepTrace`; `recordRead` resta per la traccia (§3.6)                                                                                                                             |
| RL-09, identificatori pubblicati                      | validità come la correlazione, al massimo 50 per voce pubblicata (§3.2, §3.9)                                                                                                                                 |
| RL-10, cache RTA                                      | `CACHE_FINGERPRINT_VERSION` da 14 a 15, con test (§3.9)                                                                                                                                                       |
| RL-11, contesti costruiti a mano                      | vista di default vuota, helper di test, API report di tutti i sottopercorsi (§3.4, §3.10)                                                                                                                     |

Pareri di Codex su D7 e D8: entrambi per l'opzione A, già scelta dal committente.

## Secondo giro di revisione Codex (20 novembre 2026)

Esito: **REVISE**, 9 rilievi (1 high, 8 medium). Tutti accolti nella v03; tre chiusi togliendo macchinario invece di
aggiungerlo.

| Rilievo                                            | Correzione nella v03                                                                                                                     |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| RL2-01 high, limite di 50 identificatori e catene  | il limite sparisce: un lotto ha al massimo i request id di un lotto; le catene leggono il ledger (§3.9)                                  |
| RL2-02, `skipped` delle richieste senza request id | comportamento di oggi conservato e dichiarato come eccesso di prudenza (§3.5, §5)                                                        |
| RL2-03, stato per identificatore                   | comprende le lacune senza identificatori; una seconda domanda per le sole lacune mirate, usata dall'enumeratore API Gateway (§3.3, §3.5) |
| RL2-04, instradamento fallito su discesa `skipped` | l'esito `unavailable` si combina con l'ordine unico; `skipped` resta (§3.7)                                                              |
| RL2-05, letture indipendenti nello stesso step     | deduplica per riferimento: la voce riusata compare una volta, letture indipendenti restano distinte (§3.3)                               |
| RL2-06, `source` perso senza albero                | `source` tolto dagli identificatori: oggi le lacune per identificatore sono solo `requestId` dell'execution log (§3.2, §5)               |
| RL2-07, `source` pubblicato                        | come RL2-06                                                                                                                              |
| RL2-08, contesti letterali                         | `reads` obbligatoria, vista vuota esportata, contesti dei test migrati (§3.4)                                                            |
| RL2-09, versione dello schema dell'output          | `RUNBOOK_OUTPUT_SCHEMA_VERSION` da `2.0.0` a `3.0.0` (§3.9)                                                                              |

## Terzo giro di revisione Codex (20 novembre 2026)

Esito: **REVISE**, 4 rilievi (1 high, 3 medium). Tutti accolti nella v04.

| Rilievo                                         | Correzione nella v04                                                                                                                                  |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| RL3-01 high, lotto unico con pagine perse       | ogni lacuna di un lotto nomina le sue richieste, anche con un solo lotto; `unavailable` di finestra solo se nessun lotto risponde (§3.5)              |
| RL3-02, più lacune per lo stesso identificatore | lo stato per identificatore è il più grave fra le lacune applicabili; test combinato `skipped` nel ledger, `unavailable` nel modo del nodo (§3.3, §4) |
| RL3-03, osservazioni utilizzabili senza albero  | solo request id validi e normalizzati; `traceId` o request id non valido prendono il ripiego prudente (§3.8)                                          |
| RL3-04, versioni dei formati                    | output e traccia passano a `3.0.0`, ognuno nel suo contratto; i report di go-rta-check no (§3.9)                                                      |

## Quarto giro di revisione Codex (20 novembre 2026)

Esito: **REVISE**, 4 rilievi medium, nessun high. Tutti accolti nella v05.

| Rilievo                                           | Correzione nella v05                                                                                                                    |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| RL4-01, request id non validi per l'execution log | una sola regola dei request id, nel motore, per query, correlazione, ledger e confronto senza albero; `req.42` nel ripiego (§3.2, §3.8) |
| RL4-02, deduplica per solo riferimento            | deduplica per step e riferimento; contratto: una lettura nuova restituisce voci nuove (§3.3)                                            |
| RL4-03, instradamento fallito su discesa satura   | declassa solo una discesa `queried`, come oggi (§3.7)                                                                                   |
| RL4-04, mascheramento negli export                | il mascheramento dei profili negli export di go-analyze-alarm ha la precedenza, dichiarato (§3.9)                                       |

## Quinto giro di revisione Codex (20 novembre 2026)

Esito: **REVISE**, 2 rilievi medium. Accolti nella v06.

| Rilievo                            | Correzione nella v06                                                                                                         |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| RL5-01, execution log non previsto | nella tabella delle modalità: variabile assente per ogni richiesta, `no-request-id` solo con l'execution log previsto (§3.5) |
| RL5-02, voci `skipped` sintetiche  | stato `skipped` per discesa, una sola voce di copertura per livello di destinazione come oggi (§3.6)                         |

## Approvazione (20 novembre 2026)

Il committente approva la **v06** dopo il quinto giro di revisione Codex. Lo sviluppo parte dalla v06.

## Sviluppo (21 novembre 2026)

Stato di partenza: build verde, 1159 test di go-runbook verdi.

**Motore** (`packages/go-runbook/src/engine`):

- `reads/ReadLedger.ts`: un'istanza per esecuzione, creata da `execute` e passata esplicitamente all'esecutore
  dell'albero. Registra le lacune degli step (`recordStep`, `recordFailure`, con il dettaglio limitato che prima stava
  nel motore), i lotti dei livelli (`recordBatch`) e gli esiti delle discese (`openDescent`, `attemptDescent`,
  `markDescent`, `skipDescent`); risponde allo stato di uno step con o senza identificatore, di una discesa, di un
  livello per un nodo, di un nodo (`isNodeIncomplete`) e della finestra (`windowIncomplete`). Scope di finestra, di
  nodo e d'instradamento; voci esposte uniche per step e oggetto.
- `ReadState` sostituisce `StepLookupState`, `TreeReadState` e `TreeDescentState`; `ReadIdentifier` sostituisce
  `TreeReadIdentifier`, rinominato ovunque senza alias. Tolti `readStepLookupState`, `isStepEvidenceComplete`,
  `TreeSkippedRecorderFn`, `ErrorNodeSpec.incompleteEvidence`, `TreeStepsRun.incompleteEvidence`.
- `RunbookContext.reads` (`RunbookReads`: `stateOf`, `isComplete`, `hasGapFor`) obbligatoria; `createInitialContext`
  mette `EMPTY_RUNBOOK_READS`. Sparisce la copia della copertura nel contesto dopo ogni step.
- `StepCoverage.identifiers` al posto di `scoped`. Regola unica dei request id in `reads/isRequestId.ts`, usata
  dall'execution log e dall'enumeratore API Gateway; `safeCorrelationValue` passa in `engine/reads` e il toolkit la
  riusa; `canonicalReadIdentifier` per il confronto.
- `ErrorTreeExecutor`: scope per nodo e per pseudo-nodo d'instradamento, stato delle discese e dei livelli dal ledger;
  `readState`, `worstState`, `combinedState` e le tabelle di severità tolte. `recordRead` resta per la traccia.
- `buildTreeChains`: ogni stato diverso da `queried` rende incompleti i figli.
- `RunbookExecutionResult.windowIncomplete`; traccia `3.0.0`.

**Toolkit e inventario**: `QueryApiGwExecutionLogsStep` dichiara ogni lacuna di un lotto con i suoi `requestId` e
non pubblica più `apiGwExecutionLogIncompleteRequestIds`; `enumerateApiGwRequests` usa `hasGapFor` per la modalità
`incomplete`. `enumerateLambdaInvocations`, `enumerateServiceRootErrors`, `AnalyzeAuditFallbackStep` e
`VerifyPostelBatchesStep` leggono `context.reads.isComplete`.

**Output e cache**: `buildErrorChains` senza albero confronta le osservazioni con le lacune per identificatore;
`RUNBOOK_OUTPUT_SCHEMA_VERSION` `3.0.0`; `CACHE_FINGERPRINT_VERSION` di go-watchtower-runbook 15.

**Test**: `ReadLedger.test.ts` (stati, identificatori, attribuzione, scope, discese); albero (due discese allo stesso
livello, secondo tentativo saturo, lettura `skipped` con righe, instradamento fallito con lettura `queried`,
`saturated` e `skipped`, lettura condivisa); execution log per richiesta in modalità terminale (lotto completo, saturo
e richiesta senza request id; lotto unico con pagina non letta; nessun lotto risponde); `buildErrorChains` senza
albero; versioni dei formati; cache con la versione 14. Contesti costruiti a mano con `EMPTY_RUNBOOK_READS`; helper
`createTestReads` e `createTestLedger`; `createTestContext` accetta `gaps`.

**Documentazione**: `docs/RUNBOOKENGINE.md` (§2.5, §18.6 nuova, §19.3, §19.11, versioni), README di go-runbook e di
go-rta-check; changeset `read-ledger` (major, prerelease `next`); API report rigenerati.

**Verifica** (21 novembre 2026): build, test (go-runbook 1191, tutti verdi), coverage, published (API report, import
cost, dati sensibili), lint, format, unused, dependencies, duplicates, types e scaffold verdi. I due warning di lint
restano quelli preesistenti di go-send. `new-classes` non è stato eseguito da Claude perché confronta con git: l'unica
classe nuova è `ReadLedger`, con il suo test.
