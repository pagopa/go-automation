---
'@pagopa/go-runbook': major
---

Il risultato di un'esecuzione è ridotto all'essenziale e gli errori identici di una richiesta si uniscono.

- **Errori identici uniti.** Un servizio SEND con `mergeIdenticalErrors` (B2B per pn-delivery) fa un solo nodo delle righe d'errore della stessa richiesta con lo stesso messaggio interno del log, la stessa chiamata successiva, fallback e trace e la stessa correlazione: il nodo tiene tutte le righe, scende una volta e dichiara le righe unite (`ErrorNodeSpec.occurrences`, `ErrorTreeNode.occurrences`).
- **Rilevazioni per occorrenza.** In un albero d'errore `outcome.detections` ha una voce per caso e richiesta (identificatori tipizzati, trace id in forma canonica), non per nodo, con `errors`, gli orari estremi, le righe di evidenza (il massimo, non la somma), `resolvedMessage` e le varianti distinte `resolvedMessages`; una rilevazione di finestra resta una voce. `outcome.message` nomina ogni caso una volta con il numero di errori.
- **Catene senza percorsi.** `RunbookOutput.chains` è `ErrorChainSummary[]`, il gruppo senza `members`; i renderer delle catene accettano `ErrorChainSummary`.
- `RUNBOOK_OUTPUT_SCHEMA_VERSION` passa a `4.0.0`.
