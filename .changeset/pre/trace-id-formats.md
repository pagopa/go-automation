---
'@pagopa/go-runbook': minor
---

Il toolkit riconosce più formati di trace id, elencati in `TRACE_ID_FORMATS` (un formato nuovo è una voce in più): l'X-Ray Trace ID con la sua forma compatta, che è anche il Trace ID di W3C (anche dall'header `traceparent`); il Fallback UUID di SEND (`FALLBACK-UUID:<uuid>`) e il `traceId:<uuid>` dei log applicativi.

- Un valore di questi formati nel campo trace diventa `<prefisso>TraceId`, correlazione e identificatore della discesa al trace: per esempio i log di `pn-national-registries` con `trace_id` `traceId:<uuid>` riempiono ora la riga «Trace ID» dei casi noti e l'albero rilegge il servizio per quel trace.
- La riga di fine esecuzione del motore nomina ogni caso una volta, con il numero di rilevazioni, e conta gli step eseguiti.
