---
'@pagopa/go-runbook': minor
---

Le letture CloudWatch Logs scansionano meno e non perdono righe.

- **Lotti sulla lunghezza della query.** Ogni query scansiona tutto il log group della finestra: un lotto prende quanti identificativi stanno in 10.000 caratteri invece di 50 fissi (`TreeLevelReader.batches`, `CloudWatchLogsLevelReader`, `readCloudWatchLogsBatches` con `batchSize` facoltativo e tetto). Spariscono i 50 interni dei trace di `createServiceAlarmRunbook` e il `maxRequestIds` del profilo SEND (`ExecutionLogSpec.maxRequestIds` è facoltativo; l'override di un runbook resta).
- **Una regex per i trace di un lotto.** `traceIdsInsightsPattern` e `escapeInsightsRegex`: tutte le forme di ogni trace come letterali in `@message like /…/`, le stesse righe di un `like` per forma; il profilo SEND la usa con `ServiceLogSpec.tracePatternTemplate` (facoltativo; senza, un predicato per forma come prima), e così `ServiceTraceLevelReader`.
- **`limit 10000`** sulle query per identificatore (log dei servizi SEND, execution log, trace dei servizi, invocazioni Lambda, override dell'inventario); le scansioni della finestra tengono il loro limite.
- **Divisione dei lotti saturi.** `readSplittingSaturated` divide in due e rilegge un lotto saturo entro un budget di 10 riletture per esecuzione (`RunbookContext.readSplits`, `ReadSplitBudget`); le metà incomplete tengono le righe del lotto saturo, senza doppioni (`logRowIdentity`). I lettori dei livelli dichiarano l'identità delle righe; il livello del downstream Lambda dichiara `rowIdentity`. `rowsOf` di `readCloudWatchLogsBatches` si chiama una volta per lotto finale. La Lambda multi-account tiene la sua divisione e il suo budget di 100, con la soglia al limite effettivo della query per le invocazioni.
- **Letture fallite contate.** `executeCloudWatchLogsQuery` conta ogni lettura fallita (`RunbookContext.readFailures`, `RunbookExecutionTrace.readFailures`); la telemetria la riporta in `failedQueryCount`, e `buildRunbookTelemetry` riceve la traccia. `mergeCloudWatchLogsDiagnostics` somma le statistiche disponibili invece di scartarle quando ne manca una.
