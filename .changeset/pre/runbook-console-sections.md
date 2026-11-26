---
'@pagopa/go-runbook': patch
---

Nel resoconto della console ogni richiesta API Gateway apre la sua sezione («Richiesta API Gateway») e ogni lettura di un livello dell'albero apre la sua prima della query: le righe di una richiesta e le statistiche di una query non compaiono più sotto la sezione precedente. Il titolo della sezione di una lettura è l'etichetta del lettore (per i downstream Lambda «Query log <nome>»); `LambdaReporter.downstream` riceve solo log group e numero di log.
