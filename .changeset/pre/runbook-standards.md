---
'@pagopa/go-runbook': major
---

Il codice del package segue lo standard del repository; il comportamento dei runbook e i loro digest di definizione non cambiano.

- **Traccia.** `TraceBuilder.traceStep` riceve un oggetto, `StepTraceEntry` (la `StepTrace` senza `executionOrder`), al posto di quindici parametri posizionali: `builder.traceStep({ stepId, label, kind, reachedVia, startedAt, completedAt, durationMs, status, recovered, input, output, varsWritten, flowDirective })`, con `diagnostics` ed `error` facoltativi.
- **Unioni con nome.** Nuovi tipi esportati per le unioni letterali che il codice ricopiava: `LogActionLevel`, `EscalationSeverity`, `ObservedErrorUnit` e `TraceStatus` dal motore; `ProposedAnalysisStatus` e `AnalysisType` da `./output` e `./toolkits/send`. `ActionType` è `CaseActionType | 'fallback'`.
- **Righe dei log.** `CloudWatchLogsRow` e `CloudWatchLogsRows` (da `./toolkits/common`, `./toolkits/send` e `./toolkits/interop`) danno un nome alle righe di Logs Insights che step, lettori e helper scrivevano per esteso.
- **Altri tipi con nome.** `KnownCaseDetectionOutput` (da `./output`) è la rilevazione di `KnownCaseMatchedOutcome.detections`; `ApiGwAuthorizerReporterInput` (dalla famiglia `apigw`) è l'argomento di `ApiGwReporter.apiGwAuthorizerEvaluation`.
- **Un tipo per file.** I tipi e le interfacce che stavano in più di uno per file hanno ora un file ciascuno; nomi ed entrypoint degli export non cambiano.
- **Errori.** I messaggi d'errore di `assertAnalysisAnnotations`, della scelta del profilo degli account e della query dei log di servizio SEND passano da `getErrorMessage` di `@pagopa/go-common/errors`: per un valore lanciato che non sia un `Error` il testo può essere diverso.
