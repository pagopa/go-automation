---
'@pagopa/go-runbook': major
---

Lo stato delle letture si decide in un solo punto, il read ledger dell'esecuzione, con un solo vocabolario.

- `ReadState` (`queried` < `saturated` < `unavailable` < `skipped` < `cycle`) sostituisce `StepLookupState`, `TreeReadState` e `TreeDescentState`. Una lacuna `manual` o senza motivo vale `unavailable`, una `skipped` vale `skipped` anche nei livelli dell'albero: `<prefisso>LookupState` cambia valore solo in questi casi.
- `RunbookContext.coverage` lascia il posto a `RunbookContext.reads` (`RunbookReads`), obbligatoria e in sola lettura: `stateOf`, `isComplete`, `hasGapFor`. Escono `readStepLookupState` e `isStepEvidenceComplete`; un contesto costruito a mano usa `EMPTY_RUNBOOK_READS`.
- `StepCoverage.scoped` diventa `StepCoverage.identifiers` (`ReadIdentifier`, già `TreeReadIdentifier`): una lacuna con identificatori riguarda solo quelli. Escono `ErrorNodeSpec.incompleteEvidence` e la variabile `apiGwExecutionLogIncompleteRequestIds`: un nodo è incompleto quando una lacuna nomina un identificatore della sua correlazione.
- `RunbookExecutionResult.windowIncomplete` dice se la finestra ha una lacuna di tutta la lettura. Senza albero una catena è incompleta solo se lo è la finestra, se una lacuna nomina un identificatore che la rilevazione ha osservato o se la rilevazione non ne ha osservati di utilizzabili.
- Le voci di copertura sono uniche per step e oggetto: due letture con lo stesso errore danno due voci, una lettura condivisa da più nodi una sola. Una discesa ha lo stato peggiore dei suoi tentativi e ogni stato diverso da `queried` rende incompleti i suoi figli.
- `RunbookOutput` e `RunbookExecutionTrace` passano alla versione `3.0.0`.
