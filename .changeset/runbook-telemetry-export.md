---
'@pagopa/go-runbook': minor
---

`buildRunbookTelemetry` (`@pagopa/go-runbook/output`) restituisce la telemetria di un'esecuzione, cioè le query CloudWatch Logs di ogni step e di ogni lettura dell'albero con il totale delle statistiche, senza costruire l'intero output: è il `telemetry` di `buildRunbookOutput`.
