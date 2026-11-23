---
'@pagopa/go-runbook': minor
---

`renderErrorChainTree(groups, options?)` (da `./output`) rende le catene d'errore come albero per `GOLogger.tree`, al posto della riga unica di `renderErrorChainLines`, che non cambia.

- Ogni gruppo è un ramo con l'intervallo orario e il numero di volte; ogni nodo della catena è un figlio con il caso (`✓ descrizione`) o `? non riconosciuto`, e sotto il servizio con il testo del log. Un gruppo di un solo nodo mostra il nodo sul ramo stesso; il servizio `window` dei runbook di finestra non compare.
- Il testo di un log JSON è il suo campo `message`, anche quando la riga è tagliata prima della fine.
- `ErrorChainTreeOptions.maxDetailLength` accorcia con `…` le righe di dettaglio più lunghe; il testo completo resta nell'output.
- Le vie e le interruzioni del gruppo sono figli dopo i nodi.
