# SPEC-007 · go-runbook: pulizia del package (debito tecnico) — v01

- Stato: **approvata** dal committente il 21 novembre 2026, con le scelte D1–D5.
- Autore: Claude.
- Origine: l'audit in sola lettura di `packages/go-runbook/src` del 21 novembre 2026 (jscpd, metriche ESLint e quattro
  revisioni per area: motore, `toolkits/common`, toolkit SEND/INTEROP e runtime, inventario), chiesto dal committente
  con l'istruzione di raccogliere tutto in una specifica e poi sistemare tutto.
- I percorsi sono relativi a `packages/go-runbook/src/`, salvo indicazione.

## 1. Perché

### 1.1 Le misure

- Codice duplicato (jscpd, `minTokens` 40, `minLines` 6, test esclusi): 5,5% delle righe, 2.296 righe in 191 cloni; fuori
  dall'inventario 624 righe in 57 cloni.
- Complessità (ESLint, soglia 12): 53 funzioni sopra soglia, 35 sopra 60 righe. Le peggiori:
  `AnalyzeAuditFallbackStep.execute` 48, `RunbookEngine.execute` 37 (164 righe), `RunbookEngine.detectKnownCases` 33,
  `ErrorTreeExecutor.descend` 27, `TraceBuilder.traceStep` con 16 parametri.

### 1.2 Che cosa è emerso

79 rilievi: comportamenti divergenti (alcuni sono difetti), codice morto nell'API pubblica, duplicazioni di regole,
lavoro rifatto, violazioni dello standard del repository e dei confini dell'architettura. La §3 li elenca per fase, con
un id (`A1`…); ogni id riporta l'evidenza essenziale e il rimedio.

## 2. Che cosa vede chi usa il repository

- **Comportamento dei runbook:** cambia dove oggi è sbagliato o divergente (fase A): errori di configurazione AWS e
  annullamenti che fermano l'esecuzione invece di diventare letture `unavailable`; un solo criterio per le righe
  d'errore; firme Kafka uniformi nei runbook k8s INTEROP; CID tracker a lotti.
- **API pubblica di `@pagopa/go-runbook`:** si restringe (fase B) secondo le scelte D1 e D2; changeset major sul
  prerelease `next`.
- **Formati:** l'output non cambia forma; `CACHE_FINGERPRINT_VERSION` di go-watchtower-runbook sale perché cambiano
  valori di output (fase A).

## 3. La proposta

### Fase A — comportamenti sbagliati o divergenti

- **A1. Errori di configurazione AWS.** `families/apigw/steps/QueryApiGwExecutionLogsStep.ts:211-224` e
  `families/lambda/steps/QueryLambdaInvocationStep.ts:117-122` trasformano in coverage `unavailable` anche gli errori di
  configurazione del target; `QueryLambdaAcrossAccountsStep.ts:234` li rilancia con un `isConfigurationError` scritto a
  mano (`:341-344`). Il contratto di `steps/aws/cloudwatch-logs/executeCloudWatchLogsQuery.ts:25` dice che rilanciano
  sempre. Rimedio: un helper unico di lettura a lotti in `steps/aws/cloudwatch-logs/` (abort o configurazione: throw;
  altro: `unavailable` con gli identificatori del lotto; tutti falliti: errore), che usa
  `isAWSCloudWatchLogsConfigurationError` già pubblico in `@pagopa/go-aws/cloudwatch-logs`.
- **A2. Annullamento come lettura fallita.** `inventory/send/apigw/pn-delivery-B2B-ApiGwAlarm/QueryVersioningLambdaErrorsStep.ts:127-138`
  e `inventory/send/apigw/pn-stream-delivery-progress-B2B-ApiGwAlarm/QueryStreamLambdaLogsStep.ts:87-95` non
  rilanciano l'annullamento; `engine/steps/execution/executeStep.ts:23-29` non lo rilancia e lascia nel ledger una voce
  `unavailable` spuria (`core/RunbookEngine.ts:409-410`). Rimedio: `executeStep` rilancia l'abort; un helper
  `tryCloudWatchLogsRead` (righe o coverage `unavailable`, abort sempre rilanciato) per gli step dell'inventario e per
  logsaver/SPID Hub.
- **A3. `continueOnFailure` con due significati.** Eccezione: `RunbookEngine.ts:492-503` registra il recupero;
  fallimento restituito: `:415-421` prosegue senza; gli step dei toolkit passano da `executeStep` e non risultano mai
  recuperati; `StepResult.errorRecovery` (`:500`) non è letto da nessuno. Rimedio: il recupero si decide in un punto,
  `executeSteps`, su `!result.success && continueOnFailure`; `executeStepDescriptor` converte solo l'eccezione in
  fallimento; esce `errorRecovery`.
- **A4. Regola delle righe d'errore.** `families/lambda/tree/enumerateLambdaDownstreamErrors.ts:34`
  (`isErrorLevel || hasErrorKeyword`) e `families/service/tree/enumerateTraceErrors.ts:33`
  (`isErrorLevel || (level === '' && hasErrorKeyword)`); il primo è O(N²) (`:37`). Rimedio: un solo
  `enumerateErrorRows` con la regola scelta in D4 e un `errorNodeLabel` condiviso (anche `enumerateServiceRootErrors.ts`,
  `enumerateLambdaInvocations.ts`).
- **A5. Firme Kafka divergenti in 18 runbook k8s INTEROP** («The coordinator is not aware of this member», «not the
  correct coordinator», `ECONNREFUSED`, «Client network socket disconnected», `JoinGroup(key: 11)`), con varianti di
  `version:` e del prefisso `ERROR\s*-`. Rimedio: firme canoniche in `toolkits/interop` (`INTEROP_KAFKA_SIGNATURES`),
  nella variante più larga; i runbook tengono risoluzione e link.
- **A6. Log group di data vault.** `inventory/send/apigw/pn-address-book-io-IO-ApiGwAlarm/knownServices.ts:31` usa
  `/aws/ecs/pn-data-vault`, gli altri quattro runbook apigw SEND `/aws/ecs/pn-data-vault-sep`. Rimedio secondo D5.
- **A7. Errori minori di comportamento.**
  - `inventory/interop/k8s/k8s-interop-be-delegation-outbound-writer-errors/podContext.ts:7`: `contextName` copiato
    («Delegation items writer context»).
  - `QueryStreamLambdaLogsStep.ts:63-69`: oltre 100 id restituisce `too-many-request-ids` senza coverage; rimedio con
    C9 (lotti del toolkit).
  - `toolkits/common/families/apigw/output/buildApiGwOutputContext.ts:113` e `QueryVersioningLambdaErrorsStep.ts:67`
    leggono `apiGwServicesVisited`/`apiGwCurrentQueryIdentifier*`, scritte solo da `QueryServiceLogsStep`: negli alberi
    sono sempre vuote. Rimedio con B4.
  - `inventory/interop/k8s/k8s-interop-be-backend-for-frontend-errors/AnalyzeBffEvidenceStep.ts:65-69`: righe del
    tracker aggiunte anche se già lette, conteggi gonfiati (`:91`). Rimedio: deduplica per identità di riga.
  - `families/lambda/builders/validations.ts:25-41,115-122`: `computeWiredStepIds` scritto a mano diverge dal builder
    (`query-<downstream>` anche senza `logGroup`) e ripete il controllo di `builders/finishAlarmRunbook.ts:103-108`;
    stesso schema in `toolkits/send/families/apigw/builders/validateApiGwAlarmConfig.ts:112-142,161`. Rimedio: togliere
    i controlli duplicati; gli id riservati da costanti condivise col builder.
  - `engine/actions/ActionExecutor.ts:69`: se la resa del messaggio lancia, rilancia fuori dal `catch` e il risultato
    `failed` non nasce. Rimedio con C17.

### Fase B — codice morto e API inutilizzata

- **B1. Catalogo degli step di base e `goTo`** (circa 1.355 righe in `engine/`): `AssertStep`, `CompareStep`,
  `ExistsStep`, `PatternMatchStep`, `IfStep`, `SwitchStep`, `IfBranchStep`, `SwitchBranchStep`, `LogStep`,
  `ExtractFieldStep`, `MapStep`, `RegexExtractStep`, `TemplateStep`, `executeSubPipeline`, `notifyAction`,
  `escalateAction`, `compositeAction`, `RunbookBuilder.ifBranch`/`switchBranch`, `GoToGraphAnalyzer`,
  `collectGoToReferences`, il ramo goTo di `executeSteps` e di `validateErrorTree`, `buildStepIndex`,
  `detectRuntimeCycle`, `reachedVia: 'goTo'`. Nessun uso fuori dall'engine nel monorepo e in go-watchtower; restano
  `SetVarStep`, `logAction`, `executeStep`. Rimedio secondo D1; la DFS dei cicli di `supersedes`
  (`RunbookBuilder.ts:454-473`) resta l'unica.
- **B2. Step generici senza runbook:** `HttpPostStep`, `HttpRequestStep`, `DynamoDB` Get/Query/Put/Update, `Athena`,
  `CloudWatchMetrics` in `toolkits/common/steps/`. Rimedio secondo D2.
- **B3. Campi e API morti del motore:** `RunbookContext.logs`, `LogEntry`, `addLogEntry`, `mergeChildContext`; nella
  traccia lo stato `'skipped'` e `parentStepId`; `ErrorRecoveryInfo.skipped`; la var `<prefix>LogCountAllVisits`
  (`tree/ErrorTreeExecutor.ts:428`); `createTestWorkflowServices` nel barrel di produzione; i duplicati
  `RunbookExecutionResult.durationMs`, `stepsExecuted`, `recoveredErrors` rispetto a `trace` e `finalContext` (restano,
  vedi §5).
- **B4. Pipeline lineare SEND:** `toolkits/send/families/apigw/steps/QueryServiceLogsStep.ts`,
  `state/ApiGwAnalysisState.ts`, `reporting/ApiGwServiceChainReporter.ts`, usati solo dall'hook di
  `inventory/send/apigw/pn-national-registries-PNPG-ApiGwAlarm/runbook.ts:45`. Rimedio: un renderer di query comune con
  `ServiceLogsLevelReader` (`renderServiceLogQuery`), l'hook diventa uno step sottile; escono stato delle visite,
  reporter della catena e il campo `servicesVisited` dell'output apigw.
- **B5. Reporter:** `ApiGwReporter.apiGwExecutionLogSkipped`, `LambdaReporter.stopSummary` e `LambdaTermination`,
  `LambdaReporter.section`/`.tree`; `queryFailed` duplicato; `reporter?.` su oggetti creati con `new`.
- **B6. Rami e opzioni morte:** `builders/alarmConfigValidation.ts:35` (`assertPreStepIds`),
  `time/occurrence/computeTimeRange.ts:29,56-60` (forma numerica), `buildRunbookOutput.ts` default di contesto,
  `QueryApiGwExecutionLogsStep.ts:237-238,278-344` (guardie e fallback mai raggiunti), `ParseApiGwErrorsStep.ts:99-102`
  (ordinamento completo e controllo impossibile), `enumerateServiceRootErrors.ts:38`, `ConditionEvaluator.ts:362-370`.
- **B7. Barrel di prodotto:** export doppi (`SEND_API_GW_PROFILE`, `ApiGwQueryProfile`, `SEND_SERVICE_PROFILE`,
  `buildInteropK8sCidTrackerQuery`, `INTEROP_API_GW_*`, `InteropApiGwAlarmContext`); export senza consumatori
  (`buildDownstreamDetectionQuery`, `extractLambdaRequestId`, `matchDownstreamErrorPattern`, `assertAnalysisAnnotations`
  nei barrel di prodotto) secondo D2; commenti d'intestazione superati.
- **B8. Inventario:** 7 `knownErrors.ts` vuoti o con il solo esempio; regex ripetute fra `knownErrors.ts` e
  `knownCases.ts` (lollipop, ApiKeyAuthorizerV2); il parametro `registry` di `validateCloudRunbookRegistry`
  (`inventory/registry/runbookRegistry.ts:21-33`); JSDoc orfana a `QueryVersioningLambdaErrorsStep.ts:188`.

### Fase C — duplicazioni da riunire

- **C1. Lettura a lotti** (con A1): `QueryApiGwExecutionLogsStep.ts:184-249`, `QueryLambdaInvocationStep.ts:97-136`,
  `QueryLambdaAcrossAccountsStep.ts:169-239`.
- **C2. Opzioni di query e segnale:** `executeCloudWatchLogsQuery` legge `context.signal` da sé; esce lo spread
  ripetuto in 12 punti e `toolkits/interop/helpers/interopLogsQueryOptions.ts` diventa
  `searchConfiguredProfilesQueryOptions` in common.
- **C3. Level reader:** base astratta per `LambdaDownstreamLevelReader`, `ServiceTraceLevelReader`,
  `ServiceLogsLevelReader`; `TreeLevelReader` non estende più `Step` (`engine/types/TreeLevelReader.ts`): sparisce lo
  `execute()` finto.
- **C4. Placeholder delle query:** tutto da `queries/renderQueryTemplate.ts` (`lambdaRequestIdFilter.ts:29`,
  `ServiceTraceLevelReader.ts:119,126`).
- **C5. Valore assente `-`:** un solo `readAccessLogField` e un iteratore `statusCodes` in
  `families/apigw/accessLog/accessLogRow.ts`, usati da `EvaluateApiGwAuthorizerFailureStep.ts:243-248`,
  `ApiGwReporter.ts:56-64,96-97`; `output/outputValues.ts` resta per l'output.
- **C6. Costruttori di contesto delle famiglie:** un helper `logSampleEvidence` (sette copie), `DEFAULT_MAX_RECENT_LOGS`
  e le opzioni in un posto.
- **C7. Famiglie INTEROP apigw e k8s:** `appendInteropCidPipeline` per la coda comune
  (`createInteropApiGwAlarmRunbook.ts:109-148`, `createInteropK8sAlarmRunbook.ts:46-84`); uno step di risoluzione del
  contesto parametrizzato; indice nome→ambiente comune a `defineInteropApiGwAlarm`/`defineInteropK8sAlarm`; tipi
  duplicati (`InteropK8sResolveContextFn`, `ResolveContextFn<T>`); una validazione; i builder accettano `{ alarm }`
  (29 runbook k8s e 5 apigw smettono di ricablarlo).
- **C8. Casi noti INTEROP:** `createInteropApiGwKnownCaseFactory` e `interopK8sKnownCase` delegano a
  `toolkits/common/analysis/knownCase.ts`; la fabbrica k8s riceve `environments`, `evidence`, `title`, `level`,
  `extraDetails`; i 22 runbook k8s con condizioni a mano e `interop-auth-server-apigw-5xx` passano dalle fabbriche.
- **C9. Lambda:** `requestIdsOf(rows)` al posto delle copie di `lambdaRowRequestId`; `INVOCATION_BATCH_SIZE`,
  l'id d'esempio di `getTraceInfo` e `ExecutedCloudWatchLogsQuery` in un posto; `QueryStreamLambdaLogsStep` usa
  `QueryLambdaInvocationStep` con un estrattore degli id.
- **C10. Logsaver e SPID Hub:** uno step `QueryAccountLogDiagnosticsStep` in common e `accountScopedContexts`
  esportato (oggi privato in `QueryLambdaAcrossAccountsStep.ts:316-328`).
- **C11. Firme `[DOWNSTREAM]` SEND** (53 a mano in 19 file): `downstreamMarkerPattern(service, { status?, method?,
endpoint? })` esportato, con l'escape dell'endpoint.
- **C12. CID tracker e righe INTEROP:** `readCidTrackerResults` e `readInteropLogRow` esportati da `toolkits/interop`,
  una sola regex del CID; `AnalyzeAuditFallbackStep` e `AnalyzeBffEvidenceStep` li usano.
- **C13. Hook del contesto pod:** un'opzione `podContext` di `createInteropK8sAlarmRunbook` (6 copie); il `type` della
  risorsa primaria come opzione di `finishAlarmRunbook` (due runbook oggi fanno lo spread del runbook costruito).
- **C14. Regole del motore:** `compareByFirstMs` unico (`RunbookEngine.ts:897-902,999-1013`,
  `tree/buildTreeChains.ts:140-146,198-203`); visita unica delle condizioni (`conditionLeafRefs`) e `parseStepRef`
  (`validation/collectConditionStepRefs.ts`, `collectConditionVarRefs.ts`, `findUnanchoredRowPredicates.ts`,
  `RunbookEngine.ts:868-872`); `levelSteps(level)` unico (5 copie); `identifierKey` unico; `ReadIdentifier` ed
  `EvidenceIdentifier` diventano un tipo, che `DescendRequest` incorpora.
- **C15. Output:** `countCoverageByReason` (`classifyRunbookOutcome.ts:132-140`, `buildCoverageLines.ts:74-78`);
  `CloudWatchLogsQueryStep.ts:169-180` usa `mergeCloudWatchLogsDiagnostics`; `isEarlier` una volta (oggi in
  `buildErrorChains.ts` e `output/tree/mergeObservations.ts`); `executionLogVars` in `QueryApiGwExecutionLogsStep`.
- **C16. Scheletro dei builder d'allarme:** `startAlarmRunbook` simmetrico a `finishAlarmRunbook`; costante
  `ALARM_TIME_RANGE` in `toolkits/common/time` (oggi 4 costanti e 5 letterali); `hooksAt` riusa
  `engine/builders/applyPipelineHooks.ts`.
- **C17. Motore, interruzioni ed eccezioni:** costante del messaggio d'annullamento (5 copie), un solo controllo in
  chiusura di `execute`; `failedResultUnlessAborted(context, error)` per le quattro copie del catch;
  `ActionExecutor` calcola il messaggio una volta.

### Fase D — prestazioni

- **D-1. CID tracker a lotti:** `toolkits/interop/applicationLogs/steps/QueryInteropCidTrackerStep.ts:153-169` fa una
  query per CID fino a 100 (`DEFAULT_MAX_CIDS`), poi `saturated`. Rimedio: lotti di CID per query con attribuzione sul
  campo `cid`; sparisce il tetto.
- **D-2. RegExp:** `families/apigw/accessLog/extractTraceId.ts:45-53` (cache di module) e
  `families/lambda/helpers/matchDownstreamErrorPattern.ts:74` (ricompila per ogni nodo) usano `context.regexCache` o
  compilano una volta.
- **D-3. Righe rilette:** `toolkits/send/families/apigw/tree/enumerateServiceErrors.ts` (4–5 letture per riga, scan
  non usato); `serviceLogRows.ts` `attributeServiceRow` ricostruisce il matcher per ogni riga × identificatore;
  `tree/ErrorTreeExecutor.ts:265` `retries.find` in un ciclo; `levelStepIds` ricalcolato per nodo;
  `ConditionEvaluator.ts:375` scandisce tutto in modalità booleana; `resolveRef.ts:48`.
- **D-4. `AnalyzeAuditFallbackStep.execute`** (complessità 48): quattro funzioni pure, completezza solo dal ledger,
  marker ordinati al posto degli stadi numerati.

### Fase E — standard del repository

- **E1. Citazioni di specifiche e revisioni** nel codice: `RunbookEngine.ts:119`, `RunbookBuilder.ts:342`,
  `TemplateStep.ts:59`, `Step.ts:34`, `executionLogEnablement.ts:8`, `validateApiGwAlarmConfig.ts:13,48,52,145,156`,
  `QueryServiceLogsStep.ts:223`, `SEND_API_GW_PROFILE.ts:30`, `SEND_DOWNSTREAMS.ts:7,19`,
  `interopApiGwApplicationQueries.ts:43`, `send/index.ts:4-6`, `interop/index.ts:4-6`, `RunbookProduct.ts:5`,
  `finishAlarmRunbook.ts:53`. Rimedio: toglierle.
- **E2. Un tipo per file:** `engine/types/CaseAction.ts`, `Condition.ts` (8 tipi ciascuno), `FlowDirective.ts`,
  `ActionTrace.ts`, `output/RunbookOutcome.ts`, `families/apigw/output/ApiGwOutputContext.ts`,
  `EvaluateApiGwAuthorizerFailureStep.ts`, `LambdaReporter.ts`, `finishAlarmRunbook.ts`, `defineInteropK8sAlarm.ts`,
  `createInteropApiGwKnownCaseFactory.ts`, `QueryInteropApiGwAggregatesStep.ts`, gli step dell'inventario con più
  interfacce; tipi inline duplicati (`detectionOutput`, `ApiGwAuthorizerReporterInput`).
- **E3. JSDoc:** 37 `buildRunbook` dell'inventario, le funzioni e classi pubbliche dei toolkit senza JSDoc elencate
  nell'audit; JSDoc doppie o non più vere (`QueryLambdaAcrossAccountsStep.ts:209-217`, `buildErrorChains.ts:24`,
  `EvaluateApiGwAuthorizerFailureStep.ts:172-176`, `createLambdaAlarmRunbook.ts:29-33`, `buildCoverageLines.ts:22-25`).
- **E4. Helper di go-common ignorati:** `getErrorMessage` (20 copie di `error instanceof Error ? …`),
  `omitUndefined` (spread condizionali), `trimToUndefined` (5 copie), `readRowField` al posto di
  `row.find(f => f.field === X)`, `readResultFieldRows` di go-aws al posto di `readCloudWatchResultRows`.
- **E5. Scheletro degli step:** parameter properties al posto della copia campo per campo; una base che toglie gli
  `eslint-disable require-await` ripetuti dove lo step è sincrono.
- **E6. Unioni letterali ricopiate:** `reachedVia`, stati di step e azione, severità, livelli di log, `ActionType`
  derivati per accesso indicizzato; `TraceBuilder.traceStep(entry)` al posto di 16 parametri.

### Fase F — architettura

- **F1. Il motore e il tipo «allarme»:** `RunbookEngine.ts:168,198` derivano politica di lettura e `partialOnFailure`
  da `metadata.type === 'alarm-resolution'`. Rimedio: il runbook dichiara `readPolicy`, il builder d'allarme la imposta.
- **F2. Tipi d'identificatore di prodotto nel motore** (`EvidenceIdentifierKind`, `isRequestId`,
  `ObservedErrors.unit`). Rimedio secondo D3.
- **F3. Barrel dell'engine aggirato** da 123 file di toolkit e runtime. Rimedio secondo D3.
- **F4. Conoscenza di prodotto in common:** `buildApiGwOutputContext.ts:220-240` (`xRayTraceId`, `cid`) legge nome e
  etichetta del trace id dal `runbookContext` apigw.
- **F5. Runtime:** `buildCatalogOutputContext` diventa il default di `buildRunbookOutput` in common;
  `buildOccurrenceParams` esportato dal runtime e usato da go-analyze-alarm; `RuntimeAwsAccountsPort` senza doppio
  controllo; `scrubAwsProfileNamesDeep.ts:33-41` deriva i motivi da array esportati dal motore.

## 4. Test e verifica

- Ogni fase lascia `pnpm check` verde; i test cambiano solo dove cambia il comportamento (fase A) o l'API (fase B).
- Test nuovi: helper di lettura a lotti (configurazione, abort, lotto fallito, tutti falliti); `executeStep` e
  `continueOnFailure`; `enumerateErrorRows`; firme Kafka e `[DOWNSTREAM]`; CID tracker a lotti; base dei level reader.
- Al termine: jscpd e metriche ESLint rimisurate, confronto con §1.1 nel registro.

## 5. Fuori da questa specifica

- I candidati 4–12 della revisione architetturale (investigazione dell'albero fuori da `execute`, matcher dei casi noti,
  vista del nodo, letture di finestra, policy di correlazione apigw, riferimenti derivati dal servizio, righe nel level
  reader, finto CloudWatch, `StepResult`): hanno le loro specifiche. In particolare la complessità di
  `RunbookEngine.execute` e `detectKnownCases` scende con i candidati 4 e 5, non qui.
- I campi duplicati di `RunbookExecutionResult` (`durationMs`, `stepsExecuted`, `recoveredErrors`): sono letti da
  output e script; toglierli è un cambio di contratto senza beneficio pratico.
- La ripetizione dichiarativa dell'inventario oltre a quella coperta da A5, C8, C11, C13: ogni runbook resta autonomo.

## 6. Le scelte del committente

- **D1 — Catalogo degli step e `goTo` (21 novembre 2026).** Eliminati (B1), changeset major.
- **D2 — Step generici e export senza consumatori (21 novembre 2026).** Eliminati (B2, B7); non serve esportare
  `redactHeaders` da go-common.
- **D3 — Tipi d'identificatore e barrel dell'engine (21 novembre 2026).** Solo il barrel (F3): regola
  dependency-cruiser e correzione degli import; F2 fuori.
- **D4 — Regola delle righe d'errore (21 novembre 2026).** Quella trace: la parola chiave conta solo in una riga senza
  livello.
- **D5 — Log group di data vault (21 novembre 2026).** `pn-address-book-io-IO-ApiGwAlarm` passa a
  `/aws/ecs/pn-data-vault-sep`, come gli altri runbook apigw SEND.

Nessuna modifica a `@pagopa/go-common` o `@pagopa/go-aws`: ogni helper che serve esiste già pubblico
(`isAWSCloudWatchLogsConfigurationError`, `readResultFieldRows`, `getErrorMessage`, `omitUndefined`, `trimToUndefined`,
`GORegexCache`).
