# SPEC-008 · Esecuzioni grandi — registro delle revisioni

## Origine (22 novembre 2026)

Esecuzione di `pn-delivery-B2B-ApiGwAlarm` finita con `Invalid string length` nel salvataggio della traccia. Un primo
intervento (un serializzatore scritto dentro `GOJSONFileExporter`) è stato tolto su richiesta del committente, che
chiede di affrontare il problema in modo strutturato. Il committente sceglie D1–D3.

## Versioni

| Versione | File                                         | SHA256                                                             |
| -------- | -------------------------------------------- | ------------------------------------------------------------------ |
| v01      | `SPEC-008-LargeExecutionTrace-CLAUDE-v01.md` | `9f178a9cd6f9089dad9a8847533623792be55441f51d108d334aff762cd651e6` |
| v02      | `SPEC-008-LargeExecutionTrace-CLAUDE-v02.md` | `fe9d3ed89d22c758df4ad26f2d930b6aac81c530b1f3c11a1fe2dd98b8a99eae` |

## Primo giro di revisione Codex (22 novembre 2026)

Esito: **REVISE**, 7 rilievi (4 high, 3 medium), tutti fondati sul codice e accolti nella v02.

| Rilievo                                          | Esito nella v02                                                                                                   |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| D1-CONTEXT, D1-ROUTING, D1-LEDGER, D1-PROVENANCE | i figli non si condividono: contesto, rotte, cicli, ledger, esclusioni e provenienza restano per ramo (§2.1)      |
| D1-COUNTS                                        | `count` resta il numero dei percorsi; `errors` conta gli errori distinti per `rowKey` (§2.1)                      |
| D2-STREAM-CONTRACT                               | contratto di `GOJSONStreamWriter`: firma, chiusura, promessa, errori, backpressure, export, documentazione (§2.2) |
| D2-FILE-PUBLISH                                  | file temporaneo nella stessa cartella, rinominato alla fine, tolto in caso d'errore (§2.2)                        |

## Approvazione (22 novembre 2026)

Il committente chiede di procedere subito con tutto insieme. Lo sviluppo parte dalla v02.

## Sviluppo (22 novembre 2026)

Scostamenti dalla v02, scelti nello sviluppo:

- D1: il campo si chiama `ErrorTreeNode.errorKey` ed è sempre presente (livello e righe quando il livello dichiara
  `rowIdentity`, altrimenti l'id del nodo), così nessun consumatore ricalcola il ripiego. Anche la riga dei casi
  riconosciuti del motore («Known cases identified on …») conta gli errori distinti, accanto ai nodi.
- D2: `GOJSONStreamWriter` sta in `exporters/json` ed è esportato da `@pagopa/go-common/exporters`, accanto a
  `GOJSONFileExporter` e come controparte di `GOJSONArrayScanner` (`importers/json`), invece che in `json`.
