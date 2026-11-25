---
'@pagopa/go-runbook': major
---

Un trace id ha una sola forma canonica e una sola regola di appartenenza delle righe.

- Esce `apigw.transformRawTraceId` da `toolkits/common`, `toolkits/send` e `toolkits/interop`; entra `canonicalTraceId` in `toolkits/common`: la forma X-Ray in minuscolo di un id X-Ray o compatto, in qualunque maiuscolo, o del `Root=` di un header X-Ray.
- `matchTraceIdCandidate` dà sempre il `canonical` in minuscolo, anche per un id trovato nel messaggio: `<prefisso>TraceId`, la correlazione dei nodi e la rilettura per trace dopo un fallback UUID sono in minuscolo. `…TraceIdRaw` resta il valore del log.
- Le letture per lotti di trace (`ServiceTraceLevelReader` con il predicato `@message like '{{TRACE_ID}}'`, `ServiceLogsLevelReader`) tengono le righe con la regola dell'attribuzione: una riga senza campo trace appartiene al trace solo se il messaggio lo nomina come token intero, anche in un lotto di un solo trace.
- Il profilo API Gateway SEND estrae il solo id dall'header X-Ray (`Root=([^;\s]+)`): `xRayTraceId` non contiene più `;Parent=…;Sampled=…`. Una richiesta con un valore che non è un trace id non ha correlazione `traceId`.
- `QueryServiceLogsStep` cerca un trace id nella forma data, X-Ray e compatta, e scarta le righe il cui campo trace nomina un altro trace.
