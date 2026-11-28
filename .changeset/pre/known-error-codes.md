---
'@pagopa/go-runbook': major
---

Il caso noto diventa l'errore noto, con un codice unico che go-runbook, go-runbooks e Watchtower condividono.

- `KnownCase` diventa `KnownError`, e con lui ogni nome che conteneva `KnownCase`, `knownCase` o `UnknownCase`: `KnownErrorAnalysis`, `KnownErrorDetection`, `knownError()`, `Runbook.knownErrors`, `LAMBDA_RUNTIME_KNOWN_ERRORS`, `UNKNOWN_ERROR_TITLE` e gli altri. Gli esiti `known-case-matched` e `unknown-case` diventano `known-error-matched` e `unknown-error`. La bozza dell'analisi per Watchtower v1 tiene i valori del suo contratto, `KNOWN_CASE` e `UNKNOWN_CASE_CONTEXT`.
- L'`id` di un errore noto diventa `code`, nella forma `<PRODOTTO>_<FAMIGLIA>_<ACRONIMO DEL RUNBOOK>_<ABBREVIAZIONE>`: per esempio `INTEROP_K8S_K8IBARRWSE_ATT-REG-TEM-NET-ERR`. Gli errori noti che una famiglia aggiunge a più runbook hanno l'acronimo `COMMON` (`SEND_LAMBDA_COMMON_LAM-TIM`). `knownErrorCodeOf` compone il codice, e `pnpm known-error:code` lo propone per un errore noto nuovo.
- `RunbookCatalog.validateForCloud` e `listDescriptors` rifiutano un codice fuori forma, più lungo di 100 caratteri o dato a due errori noti diversi.
- `RunbookOutput` passa allo schema `5.0.0`: ogni rilevamento porta `code` al posto di `caseId` e il tipo di analisi del suo errore noto (`analysisType`). Nei passi interni `caseId` diventa `knownErrorCode`, e la traccia dell'esecuzione passa allo schema `4.0.0`.
- `RunbookDescriptor` porta il prodotto e gli errori noti del runbook (`KnownErrorDescriptor`: codice, titolo, descrizione, risoluzione e tipo di analisi). Un titolo che interpola l'occorrenza lascia il posto alla descrizione.
- I file `knownErrors.ts` con i modelli degli errori dei downstream si chiamano `downstreamErrorPatterns.ts`; i file `knownCases.ts` diventano `knownErrors.ts`.
