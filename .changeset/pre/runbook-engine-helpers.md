---
'@pagopa/go-runbook': major
---

Le regole che il motore ripeteva in più punti passano da un helper solo; il comportamento dei runbook non cambia.

- **Identificativi.** Esce `ReadIdentifier`: `EvidenceIdentifier` (`kind`, `value`) è l'unico tipo dell'identificativo, che sia osservato nell'evidenza, cercato da una lettura o nominato da una lacuna. Lo usano `TreeLevelReader.read`, `TreeRowAttributionFn`, `TreeSecondAttemptFn`, `TreeEnumeration`, `RunbookReads`, `StepCoverage.identifiers` e, in `./toolkits/common`, `CloudWatchLogsLevelReader`, `CloudWatchLogsBatchedRead` e `CloudWatchLogsRead`.
- **Discese.** `DescendRequest.identifier` è un `EvidenceIdentifier` ed esce `DescendRequest.kind`; cambiano allo stesso modo le discese dei nodi dell'albero (`TreeDescent`, in `ErrorTreeNode.descents`). Uno step di nodo scrive `{ target, identifier: { kind: 'traceId', value: traceId } }` al posto di `{ target, identifier: traceId, kind: 'traceId' }`.
- **Errori.** Un valore lanciato da una lettura di un livello dell'albero che non sia un `Error` ha ora il messaggio di `getErrorMessage` di `@pagopa/go-common/errors`, come quelli lanciati dagli step e dalle azioni.
