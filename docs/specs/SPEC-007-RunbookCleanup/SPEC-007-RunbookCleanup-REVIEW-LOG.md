# SPEC-007 · Pulizia di go-runbook — registro delle revisioni

## Origine (21 novembre 2026)

Audit in sola lettura di `packages/go-runbook/src`: jscpd, metriche ESLint e quattro revisioni per area. 79 rilievi,
di cui i più importanti verificati sul codice prima di riportarli. Il committente chiede di raccoglierli in una
specifica e di procedere poi a sistemare tutto; sceglie D1–D5.

## Versioni

| Versione | File                                    | SHA256                                                             |
| -------- | --------------------------------------- | ------------------------------------------------------------------ |
| v01      | `SPEC-007-RunbookCleanup-CLAUDE-v01.md` | `2c191172155bf3aa8425f11b7642fdeeef6aa5d59e1844a102c258684d4aec0a` |

## Approvazione (21 novembre 2026)

Il committente chiede di procedere con lo sviluppo subito dopo la specifica, con le scelte D1–D5. Lo sviluppo parte
dalla v01, una fase per volta (E1, B, A, C, D, E, F), con `pnpm check` verde alla fine di ogni fase.

## Sviluppo — fasi E1 e B (21 novembre 2026)

- **E1:** tolte le citazioni di specifiche, revisioni e fasi da circa 21 file; riscritte le intestazioni superate dei
  barrel di send, interop e della radice.
- **B1:** fuori dall'engine il catalogo degli step di base e `goTo` (33 file cancellati, −2.254 righe): `executeSteps`
  è un ciclo lineare, `FlowDirective` è `'continue' | 'stop'`, escono `Step.nestedSteps()` e la concatenazione delle
  visite ripetute (senza `goTo` uno step non si ripete). Restano `SetVarStep`, `logAction`, `executeStep`.
- **B2:** fuori gli 8 step generici (16 file, −1.552 righe); servizi, porte e `OPERATIONAL_SERVICE_*` restano perché
  servono a registro dei servizi, runtime e script. Il controllo OAM di `assertCloudExecutableRunbook` guarda
  `requiredServices()` invece delle classi tolte.
- **B3:** fuori `RunbookContext.logs`, `LogEntry`, `addLogEntry`, `mergeChildContext`, `ErrorRecoveryInfo.skipped`,
  `StepTrace.parentStepId`, lo stato `'skipped'` della traccia, `<prefix>LogCountAllVisits`; `createTestWorkflowServices`
  fuori dal barrel.
- **B4:** `renderServiceLogQuery` comune a `ServiceLogsLevelReader` e allo step dell'hook PNPG; fuori
  `ApiGwAnalysisState`, `ApiGwServiceChainReporter`, le variabili delle visite e `servicesVisited` dell'output apigw.
  Il digest di definizione di `pn-national-registries-PNPG-ApiGwAlarm` cambia.
- **B5–B8:** reporter senza metodi morti, `queryFailed` in un helper interno; rami morti tolti; barrel di prodotto
  senza copie né export inutilizzati; 7 `knownErrors.ts` vuoti cancellati, regex di lollipop e ApiKeyAuthorizerV2 in
  una costante.
- **Documentazione:** `docs/RUNBOOKENGINE.md` (§3.2–3.4, §14 e §17.4 tolte senza rinumerare, per i rimandi),
  `docs/CONVENTIONS.md`, README di go-runbook. Changeset `runbook-dead-code` (major); report API rigenerati.
- **Verifica:** `pnpm check` verde, rilanciato da Claude; go-runbook 1150 test (1225 prima: escono i test del codice
  tolto). Circa −5.660 / +550 righe, documentazione compresa.

## Sviluppo — fase A, con C1 e C2 (21 novembre 2026)

- **A1 + C1:** `readCloudWatchLogsBatches`, `tryCloudWatchLogsRead` ed `endsCloudWatchLogsRead` in
  `toolkits/common/steps/aws/cloudwatch-logs/`: un lotto fallito è `unavailable` con i suoi identificatori,
  annullamento ed errori di configurazione del target fermano lo step. Usati dagli step execution-log API Gateway,
  ricostruzione Lambda e Lambda su più account. **Scostamento dalla v01:** la specifica indicava
  `isAWSCloudWatchLogsConfigurationError` di go-aws, ma la regola `only-runtime-touches-sdk` vieta ai toolkit di
  importare `@pagopa/go-aws/cloudwatch-logs`, e quella funzione include due codici che go-aws tratta come letture
  recuperabili; il controllo resta uno, in `endsCloudWatchLogsRead`, con i due codici del target. Quando nessun lotto
  risponde, gli step execution-log e stream tengono il loro stato `unavailable` (usato da output e dallo step che ferma
  l'analisi); la ricostruzione Lambda fallisce come prima.
- **A2 + C2:** `executeCloudWatchLogsQuery` passa da sé `context.signal`; `SEARCH_CONFIGURED_PROFILES_QUERY_OPTIONS`
  sostituisce l'helper INTEROP; `executeStep(context, label, fn)` rilancia l'annullamento; `tryCloudWatchLogsRead` negli
  step di versioning, logsaver e SPID Hub, lotti nello step stream.
- **A3:** il recupero di `continueOnFailure` si decide in `executeSteps` per eccezione e per fallimento restituito;
  esce `StepResult.errorRecovery`. `VerifyPostelBatchesStep` del runbook POSTEL entra ora in `recoveredErrors`.
- **A4:** `enumerateErrorRows` (regola trace, O(N)) ed `errorNodeLabel` in `toolkits/common/tree/`.
- **A5:** `INTEROP_KAFKA_SIGNATURES` e `interopErrorLine` in `toolkits/interop`, usati da 19 runbook k8s.
  **Scostamento dalla v01:** la variante più larga per errore (senza prefisso e senza distinguere le forme) rompeva 12
  test d'inventario e in un caso attribuiva un crash `ECONNREFUSED` anche alla connessione rifiutata; resta una firma
  per forma di riga, allargata solo nella sintassi (ogni `version:`, ogni spaziatura, `Heartbeat`/`JoinGroup`/
  `LeaveGroup`), con il prefisso `ERROR -` dove c'era. Valutato e accolto da Claude: l'errore era della specifica.
- **A6:** `pn-address-book-io-IO-ApiGwAlarm` legge `/aws/ecs/pn-data-vault-sep`.
- **A7:** `contextName` corretto; lo step stream legge a lotti di 100; `AnalyzeBffEvidenceStep` deduplica le righe;
  i validatori Lambda e SEND API Gateway non ripetono il controllo dei riferimenti, gli id riservati vengono da
  `LAMBDA_PIPELINE_STEP_IDS` e `SEND_API_GW_STEP_IDS` usati anche dai builder; `ActionExecutor` calcola il messaggio
  una volta e un errore di resa dà `failed`.
- `CACHE_FINGERPRINT_VERSION` a 18; changeset `runbook-read-behavior` (major); report API rigenerati.
- **Verifica:** `pnpm check` verde, rilanciato da Claude; go-runbook 1180 test, go-watchtower-runbook 60.

## Sviluppo — fase C, toolkit e inventario (22 novembre 2026)

- **C3:** `TreeLevelReader` non estende più `Step` (`id`, `label`, `kind`, `read`, `getTraceInfo?`,
  `requiredServices?`); base `CloudWatchLogsLevelReader` per i tre lettori dell'albero.
- **C4:** placeholder sempre con `renderQueryTemplate`; un template senza `{{REQUEST_ID_FILTER}}` ora fallisce invece
  di leggere tutta la finestra (tutti i template attuali lo contengono).
- **C5:** `readAccessLogField` unico; `ApiGwReporter`, che riceve stringhe, usa `normalizeOutputValue`.
- **C6:** `logSampleEvidence`, `DEFAULT_MAX_RECENT_LOGS`, `LogSampleOptions` in `toolkits/common/output/`.
- **C7:** `appendInteropCidPipeline`; base `ResolveInteropAlarmContextStep`, `interopAlarmEnvironment`,
  `ResolveInteropAlarmContextFn<T>`; una validazione (`validateServiceIdentity`); builder INTEROP con `{ alarm }`,
  29 runbook k8s e 4 apigw migrati.
- **C8:** fabbriche INTEROP su `knownCase`; la fabbrica k8s riceve ambienti, evidenza, condizione, titolo, livello,
  `supersedes`, dettagli extra e `details` (cinque runbook mostrano righe diverse da quelle standard: imporle avrebbe
  cambiato ciò che vede l'operatore). 22 runbook k8s e `interop-auth-server-apigw-5xx` migrati.
- **C9 (in parte):** `requestIdsOf`, `INVOCATION_BATCH_SIZE`, query d'esempio in un posto. **Non fatto:**
  `QueryStreamLambdaLogsStep` su `QueryLambdaInvocationStep`: lotti, query, esito e variabili diversi; servirebbero
  molte opzioni per tenere lo stesso comportamento.
- **C10:** `QueryAccountLogDiagnosticsStep` e `accountScopedContexts` in common; logsaver e SPID Hub li estendono.
- **C11:** `downstreamMarkerPattern` in `toolkits/send/analysis/`; 49 regex convertite, stringhe identiche.
- **C12:** `INTEROP_CID_PATTERN`, `readInteropLogRow`, `readCidTrackerResults`.
- **C13:** opzione `podContext` del builder k8s (6 runbook) e `primaryResourceType` di `finishAlarmRunbook`.
- **C15:** `countCoverageByReason`, `isEarlier` una volta, `CloudWatchLogsQueryStep` con
  `mergeCloudWatchLogsDiagnostics`, `executionLogVars`.
- **C16 (in parte):** `startAlarmRunbook` nei 5 builder, `ALARM_TIME_RANGE` in toolkit e inventario. `hooksAt` su
  `applyPipelineHooks` passa al passaggio sul motore.
- **Digest:** su 72 runbook cambiano 2 per la forma della condizione d'ambiente prodotta dalle fabbriche, con lo
  stesso risultato (`k8s-interop-be-delegation-readmodel-writer-sql-errors`, `interop-auth-server-apigw-5xx`).
- Changeset `runbook-shared-helpers` (major); report API rigenerati.
- **Verifica:** `pnpm check` verde, rilanciato da Claude; go-runbook 1218 test.

## Sviluppo — fase C, motore (22 novembre 2026)

- **C14:** `compareByFirstMs` (quattro copie, compreso l'ordinamento delle osservazioni in `readEvidence`);
  `conditionLeafRefs` e `parseStepRef` per le visite delle condizioni e `canonicalRef`; `levelSteps` (quattro copie);
  `identifierKey`; un solo tipo d'identificatore, `EvidenceIdentifier`: `ReadIdentifier` esce e `DescendRequest`
  diventa `{ target, identifier, via? }`, rinominato ovunque. **Lasciato com'è:** `findUnanchoredRowPredicates`
  ricava lo step dall'intera coda del riferimento (`steps.q.output` non è contato con `steps.q`); allinearlo rende la
  validazione più severa (nessun test né runbook cambia esito). Decisione del committente, aperta.
- **C17:** un solo controllo dell'annullamento in chiusura di `execute`; `failedResultUnlessAborted` per le quattro
  copie del catch; `RUNBOOK_ABORTED_MESSAGE` per il messaggio del motore (il `failureReason` della traccia, diverso, è
  ora in un punto solo).
- **C16, chiuso:** `pipelineHooksAt` in `applyPipelineHooks.ts`, usato anche dai builder Lambda e servizio.
- Changeset `runbook-engine-helpers` (major); report API rigenerati.
- **Verifica:** `pnpm check` verde, rilanciato da Claude; go-runbook 1218 test, invariati.

## Sviluppo — fasi D e F (22 novembre 2026)

- **D-1:** CID tracker a lotti di 50 (`filter cid in [...]`) con `readCloudWatchLogsBatches`, righe attribuite sul
  campo `cid`; escono `DEFAULT_MAX_CIDS`, `maxCids`, la coverage `saturated` dei CID non interrogati e
  `<prefix>SkippedCidCount`. Un lotto fallito è `unavailable` per i suoi CID; gli errori di configurazione fermano lo
  step. `scripts/interop/interop-analyze-alarms` adeguato nella libreria (passa `[cid]`), `index.ts` non toccato.
- **D-2:** `traceIdReader(schema)` e `downstreamFinder(patterns)` compilano una volta; esce la cache di module.
  `context.regexCache` scartato: non supporta il flag `i` dei pattern downstream.
- **D-3:** `enumerateServiceErrors` legge ogni riga una volta (`findKnownUrlCall`); `Map` al posto di `retries.find`;
  step id dei livelli calcolati una volta; scansione booleana che si ferma al primo match; `Set` in `resolveRef`.
  `TreeRowAttributionFn` diventa `(identifier) => TreeRowPredicate`: il motore costruisce il test una volta per
  identificatore, senza stato in closure.
- **D-4:** `AnalyzeAuditFallbackStep.execute` in quattro funzioni pure con `FALLBACK_SEQUENCE`; completezza solo dal
  ledger. Un test cambia solo la preparazione (dichiara la lettura saturata, come fa lo step di query).
- **F1:** `Runbook.readPolicy` e `RunbookBuilder.readPolicy()`; `AlarmRunbookBuilder` imposta `partial`; il motore usa
  `readPolicy ?? 'strict'`. I 72 runbook dell'inventario si comportano come prima.
- **F3:** `engine/internal.ts`, non pubblicato, per gli helper usati dai toolkit; regola dependency-cruiser
  `toolkits-and-runtime-use-engine-barrels`; import riscritti in 131 file. `interpolatePlaceholders` passa da
  `internal.ts` per non pesare sul costo d'import di `./output`.
- **F4:** `ApiGwRunbookContext.traceIdVar` e `traceIdLabel` dal profilo; `buildApiGwOutputContext` non elenca più i
  nomi di prodotto.
- **F5:** `buildFamilyOutputContext` default di `buildRunbookOutput`, esce `buildCatalogOutputContext`;
  `buildOccurrenceParams` esportato dal runtime e usato da go-analyze-alarm (`index.ts` non toccato);
  `RuntimeAwsAccountsPort` senza doppio controllo; `COVERAGE_REASONS` ed `ERROR_CHAIN_INTERRUPTION_REASONS`.
- Digest: cambiano per tutti i runbook d'allarme (`readPolicy`) e per gli apigw SEND (`traceIdVar`, `traceIdLabel`).
  `CACHE_FINGERPRINT_VERSION` a 19. Changeset `runbook-performance-architecture` (major); report API rigenerati.
- **Verifica:** `pnpm check` verde, rilanciato da Claude; go-runbook 1223 test.

## Sviluppo — fase E (22 novembre 2026)

- **E2:** 37 file con più tipi divisi in circa 97 file; `CloudWatchLogsRow`/`CloudWatchLogsRows` al posto di 22 alias
  locali, `KnownCaseDetectionOutput`, `ApiGwAuthorizerReporterInput`. **Non fatto:** `Condition`/`And`/`Or`/`Not` e
  `CaseAction`/`CompositeAction` restano insieme: sono tipi ricorsivi e separarli crea cicli d'import vietati da
  dependency-cruiser.
- **E3:** JSDoc su 36 `buildRunbook` e 22 funzioni e classi pubbliche dei toolkit; 5 JSDoc orfane o non più vere
  corrette.
- **E4:** `getErrorMessage`, `readRowField`, `trimToUndefined`, `omitUndefined` (31 spread). **Non fatto:**
  `readResultFieldRows` al posto di `readCloudWatchResultRows`: risultato diverso per i 5 chiamanti.
- **E5:** una parameter property. **Non fatto:** gli altri costruttori copiano campi da un oggetto di configurazione
  (salvarlo intero cambierebbe i digest); i 21 `eslint-disable require-await` restano, perché la forma senza `async` è
  vietata da `@typescript-eslint/promise-function-async`.
- **E6:** `TraceBuilder.traceStep(entry)`; tipi con nome condivisi al posto delle unioni ricopiate (`no-restricted-syntax`
  vieta l'accesso indicizzato letterale).
- I digest dei 72 runbook non cambiano. Changeset `runbook-standards` (major); report API rigenerati.
- **Verifica:** `pnpm check` verde, rilanciato da Claude; go-runbook 1223 test.

## Misure finali (22 novembre 2026)

| Misura (jscpd `minTokens` 40, `minLines` 6; ESLint soglia 12) | Prima                         | Dopo                          |
| ------------------------------------------------------------- | ----------------------------- | ----------------------------- |
| Righe di sorgente (test esclusi)                              | 43.864                        | 41.214                        |
| Duplicazione                                                  | 5,5% (2.296 righe, 191 cloni) | 3,8% (1.470 righe, 129 cloni) |
| Duplicazione fuori dall'inventario                            | 624 righe, 57 cloni           | 92 righe, 10 cloni            |
| Funzioni con complessità > 12                                 | 53                            | 40                            |
| Funzioni > 60 righe                                           | 35                            | 26                            |
| Funzioni con più di 5 parametri                               | 5                             | 4                             |
| Test di go-runbook                                            | 1.225                         | 1.223                         |

Le funzioni più complesse restano `RunbookEngine.execute` (32) e `detectKnownCases` (31): scendono con i candidati 4
e 5 della revisione architetturale (§5).

## Aperto

- `findUnanchoredRowPredicates` ricava lo step dall'intera coda del riferimento (`steps.q.output` non è contato con
  `steps.q`): allinearlo rende la validazione più severa, senza cambiare l'esito di nessun test o runbook. Decisione del
  committente.
