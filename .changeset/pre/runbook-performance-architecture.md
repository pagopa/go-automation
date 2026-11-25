---
'@pagopa/go-runbook': major
---

Le letture rifatte o ripetute dei runbook si fanno una volta sola, e i confini fra motore, toolkit e runtime diventano espliciti.

- **CID tracker INTEROP a lotti.** `QueryInteropCidTrackerStep` legge i CID con una query per lotto di 50 invece che con una query per CID, e attribuisce ogni riga al CID del campo `cid` che la query estrae. Esce il tetto di 100 CID: esce l'opzione `maxCids`, la voce di copertura `saturated` dei CID non interrogati e la variabile `<prefix>SkippedCidCount`. Un lotto fallito è `unavailable` per i suoi CID, un lotto al limite di righe è `saturated` per i suoi CID; annullamento ed errori di configurazione del target fermano lo step. `BuildInteropK8sCidTrackerQueryFn` riceve i CID del lotto (`(cids: ReadonlyArray<string>) => string`) e `buildInteropK8sCidTrackerQuery` filtra con `filter cid in [...]`. Il risultato per CID resta `{ cid, rows }`.
- **Attribuzione delle righe dell'albero.** `TreeRowAttributionFn` diventa `(identifier) => TreeRowPredicate`: il motore costruisce il test una volta per identificativo del lotto invece che per riga. Nuovo tipo `TreeRowPredicate`.
- **Politica di lettura.** Il runbook dichiara `readPolicy` (`'partial' | 'strict'`, tipo `ReadPolicy`), impostata con `RunbookBuilder.readPolicy(...)`; `AlarmRunbookBuilder` imposta `partial`. Il motore non deduce più la politica da `metadata.type`: un runbook costruito a mano senza `readPolicy` legge in modo `strict`. I runbook dell'inventario si comportano come prima.
- **Output.** `buildRunbookOutput` usa per default il contesto della famiglia del runbook (API Gateway, Lambda, servizio); esce `buildCatalogOutputContext` da `./runtime`. Il contesto API Gateway legge nome ed etichetta del trace id da `traceIdVar` e `traceIdLabel` di `ApiGwRunbookContext`, che il builder SEND imposta dal profilo.
- **Runtime.** Nuovo `buildOccurrenceParams` (con `OccurrenceParamsInput`): i parametri di un'esecuzione per un'occorrenza, usati da `executeRunbookForOccurrence` e dalla CLI.
- **Motore.** Nuove costanti `COVERAGE_REASONS` ed `ERROR_CHAIN_INTERRUPTION_REASONS`, da cui derivano `CoverageReason` ed `ErrorChainInterruptionReason`; `LogActionRow` è esportato.
