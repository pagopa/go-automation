# SPEC-010 · Discese condivise e risultato essenziale — registro delle revisioni

## Origine (22 novembre 2026)

Dopo la SPEC-009 l'esecuzione B2B scansiona meno byte ma dura quasi il doppio: le righe lette per intero moltiplicano
le copie dei sottoalberi. Il committente chiede la specifica del punto 3 (una discesa per richiesta), traccia e
risultato facoltativi con due parametri distinti, e un risultato ridotto all'essenziale in ogni caso.

## Versioni

| Versione | File                                    | SHA256                                                             |
| -------- | --------------------------------------- | ------------------------------------------------------------------ |
| v01      | `SPEC-010-SharedDescents-CLAUDE-v01.md` | `dbdc02136d123e6c5e3daa0200f9f0ea1920c31a826de1e8f4aca7a118f17989` |
| v02      | `SPEC-010-SharedDescents-CLAUDE-v02.md` | `77bd5b1d032b381a7fa4dfa24be938f2f58636de7750d79e4b4ae64628974b2b` |

## Scelte del committente (22 novembre 2026)

D1 riuso solo fra discese equivalenti; D2 rilevazioni per caso e occorrenza; D3 `chains[].members` fuori dal
risultato; D4 `output.trace` falso, `output.result` vero.

## Primo giro di revisione Codex (22 novembre 2026)

Esito: **REVISE**, 7 rilievi (5 high, 2 medium), verificati.

| Rilievo                                   | Esito nella v02                                                                                                                                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DEPENDENCIES, ROUTING, LEDGER, PROVENANCE | il riuso fra discese equivalenti non è sicuro: i casi si valutano dopo tutte le discese, rotte, ledger e contesto sono del ramo. Il committente sceglie di unire gli errori identici della stessa richiesta (D1 rivista, §2.1) |
| OCCURRENCE-KEY                            | chiave dell'occorrenza con gli identificatori tipizzati in forma canonica (§2.2)                                                                                                                                               |
| MATCH-MESSAGE                             | `resolvedMessages` con le varianti distinte (D5, §2.2)                                                                                                                                                                         |
| TRACE-MEMBERS                             | il file della traccia aggiunge `chains` completi (§2.2)                                                                                                                                                                        |

## Scelte D1 rivista e D5 (22 novembre 2026)

D1: unire gli errori identici della stessa richiesta. D5: il primo messaggio come riepilogo e le varianti distinte.

## Approvazione (22 novembre 2026)

Il committente chiede di partire subito con lo sviluppo della v02, senza attendere altre conferme; i rilievi del
secondo giro di Codex si valutano durante lo sviluppo.

## Secondo giro di revisione Codex (22 novembre 2026)

Esito: **REVISE**, 5 rilievi (2 high, 2 medium, 1 low), verificati e accolti nello sviluppo.

| Rilievo                                                                                          | Esito                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RV2-01 la chiave sulle variabili non unisce le righe B2B (JSON intero con orari e `stack_trace`) | la chiave usa il `message` interno del log, la chiamata successiva, fallback, trace e correlazione; orari e stack restano nelle righe del nodo. I casi B2B leggono `deliveryErrorMsg` solo per mostrarlo |
| RV2-02 rilevazioni dei runbook di finestra                                                       | raggruppate per richiesta solo nell'albero; una rilevazione di finestra resta una voce                                                                                                                   |
| RV2-03 somma delle righe di evidenza                                                             | il massimo per occorrenza: ogni errore di una richiesta legge le stesse righe                                                                                                                            |
| RV2-04 nodi uniti nella traccia                                                                  | la traccia salva `errorTree` con i nodi (`occurrences`, `errorKey` con i `@ptr` delle righe) e le catene complete                                                                                        |
| RV2-05 renderer e `ErrorChainSummary`                                                            | i renderer accettano `ErrorChainSummary`                                                                                                                                                                 |

## Sviluppo (22 novembre 2026)

Scostamenti dalla v02: la chiave dell'unione (RV2-01) e il conteggio delle righe di evidenza (RV2-03) come sopra; il
parametro dell'unione si chiama `mergeIdenticalErrors` del servizio (`ApiGwService`); la traccia aggiunge `errorTree`
(nodi e catene) invece delle sole catene.
