---
'@pagopa/go-aws': minor
---

Logs Insights: risultati parziali e completezza per query.

- Ogni `AWSCloudWatchLogsQueryExecution` riporta le righe restituite (`rowsReturned`) e le pagine non lette (`unreadPages`: `budget` o `failed`).
- Con la nuova opzione `partialResults` una lettura fallita o troncata non butta più quanto già letto: si restituiscono le righe delle query e delle pagine riuscite, le pagine non lette restano sull'esecuzione e le letture fallite dopo aver provato tutti i candidati finiscono in `failedReads`. L'annullamento e gli errori di configurazione del target continuano a lanciare un'eccezione. Senza l'opzione il comportamento non cambia.
