---
'@pagopa/go-aws': minor
---

`AWSDynamoDBService` aggiunge `scanRaw` (scan completo, item in wire form), `updateItemRaw` (SET che unisce gli attributi senza sostituire l'item) e `batchWriteItemRaw` (scrittura a batch con retry degli `UnprocessedItems`, che restituisce quanto non è stato scritto).
