---
'@pagopa/go-runbook': minor
---

Gli errori dell'albero si contano una volta sola, qualunque sia il numero di percorsi che li raggiungono. Quando più nodi fratelli scendono allo stesso livello con lo stesso identificatore, ognuno ha i suoi figli (contesto, rotte, letture ed esclusioni restano del suo ramo), ma i figli enumerati dalle stesse righe riportano lo stesso errore:

- `ErrorTreeNode.errorKey`: l'identità dell'errore del nodo, cioè il livello e le righe quando il livello dichiara `rowIdentity`, altrimenti il nodo stesso;
- `ErrorChainGroup.errors`: gli errori distinti in cui finiscono i percorsi del gruppo; `count` resta il numero dei percorsi;
- le righe e l'albero delle catene mostrano gli errori e, quando sono meno dei percorsi, anche i percorsi (`45 volte, 4575 percorsi`);
- «Errori senza caso noto», la riga di fine esecuzione (`cases: … ×N`) e quella dei casi riconosciuti contano gli errori distinti.

`RUNBOOK_OUTPUT_SCHEMA_VERSION` passa a `3.1.0`.
