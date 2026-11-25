# SPEC-009 · Letture CloudWatch — registro delle revisioni

## Origine (22 novembre 2026)

Analisi dell'esecuzione di `pn-delivery-B2B-ApiGwAlarm` del 25 ottobre 2026: query ripetute sullo stesso log group
e letture sature. Il committente chiede una specifica per le proposte 1 (una scansione per livello) e 2 (nessuna riga
persa); la proposta 3 (discesa una volta per richiesta) resta fuori.

## Versioni

| Versione | File                                     | SHA256                                                             |
| -------- | ---------------------------------------- | ------------------------------------------------------------------ |
| v01      | `SPEC-009-QueryEfficiency-CLAUDE-v01.md` | `b5f6bf9cc3397738285027dda83ee66e25af44feb812fb5d3391a848501fb17e` |
| v02      | `SPEC-009-QueryEfficiency-CLAUDE-v02.md` | `15c12690a52ab48f5d505cc29541acd2a9c7d61ef145e1e5b865efdd55d9e5e3` |
| v03      | `SPEC-009-QueryEfficiency-CLAUDE-v03.md` | `91e86d71cb85a7dc095a72ce85cdeb9d156ab0811304717a373bcd4ba9abf80c` |
| v04      | `SPEC-009-QueryEfficiency-CLAUDE-v04.md` | `3c3ea863aa0d96c82d4b2370371ed3a9835c1c7a6b5ca860f3d65f11d8ec9a3c` |
| v05      | `SPEC-009-QueryEfficiency-CLAUDE-v05.md` | `542abc8fe18d6ecd0a3971f79b6020b4cd90527ab78c944adf3df7fef5b360b3` |

## Primo giro di revisione Codex (22 novembre 2026)

Esito: **REVISE**, 7 rilievi (3 high, 4 medium), verificati sul codice e accolti nella v02.

| Rilievo                                                  | Esito nella v02                                                                                                               |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| SPEC009-01 regex X-Ray più larga, valore originale perso | `(?:1-E-\|E)R`, valore ricevuto come letterale protetto, `fallbackUuid` invariato, `QueryServiceLogsStep` incluso (§2.1)      |
| SPEC009-02 ledger dopo la divisione                      | divisione dentro la lettura: un esito, copertura sugli identificatori ancora incompleti, diagnostici di tutte le query (§2.2) |
| SPEC009-03 evidenza persa nelle metà                     | righe del lotto saturo conservate per gli identificatori incompleti o se le riletture falliscono (§2.2)                       |
| SPEC009-04 `rowsOf` del tracker CID                      | `rowsOf` una volta per lotto finale (§2.2)                                                                                    |
| SPEC009-05 soglia fissa della Lambda multi-account       | invocazioni con il limite effettivo, scansione errori invariata (§2.2)                                                        |
| SPEC009-06 limite di Insights                            | pagina di 10.000, fino a 100.000 per query: D2 con l'alternativa (§1.3, §5)                                                   |
| SPEC009-07 override di pn-external-registries            | 7 limiti degli override inclusi; i fatti distinguono righe trovate, restituite, attribuite ed `ERROR` (§1.3, §3)              |

## Scelte del committente (22 novembre 2026)

D1 regex per lotto, D2 `limit 10000`, D3 divisione con 10 query in più, D4 execution log con tutte le righe.

## Secondo giro di revisione Codex (22 novembre 2026)

Esito: **REVISE**, 6 rilievi (1 high, 3 medium, 2 low), verificati e accolti nella v03.

| Rilievo                                  | Esito nella v03                                                                                                               |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| V02-01 attribuzione nella divisione      | appartenenza e identità della riga pure nel contratto; `rowsOf` una volta sulle righe definitive (§2.2)                       |
| V02-02 tetti interni di 50               | tolti `TRACE_BATCH_SIZE` e `maxRequestIds` del profilo SEND; restano l'1 dei template a un id e gli override espliciti (§2.1) |
| V02-03 query fallite fuori dal conteggio | letture fallite contate a parte, byte dalle sole statistiche; D5 per un eventuale cambio di `@pagopa/go-aws` (§2.2, §5)       |
| V02-04 confine multi-account             | divisione condivisa al livello del lotto, aggregazione e fallimento restano dello step (§2.2)                                 |
| V02-05 test della query SEND             | asserzioni sulla forma diventano asserzioni sulla regex (§3)                                                                  |
| V02-06 «righe d'errore»                  | «righe corrispondenti al filtro e mai restituite»; conteggio per livello nel confronto (§1, §3)                               |

## Scelta D5 (22 novembre 2026)

Il committente sceglie di contare le query fallite in go-runbook, senza cambiare `@pagopa/go-aws`.

## Terzo giro di revisione Codex (22 novembre 2026)

Esito: **REVISE**, 6 rilievi (4 medium, 2 low), verificati e accolti nella v04 con uno scostamento.

| Rilievo                               | Esito nella v04                                                                                                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V03-01 letture fallite accorpate      | una lettura fallita per lotto, telemetria anche se falliscono tutti, statistiche disponibili sommate (§2.2)                                                                                       |
| V03-02 budget per lettore             | un budget per esecuzione creato dal motore, sulle letture logiche (§2.2). **Scostamento**: la Lambda multi-account tiene le sue 100 riletture, perché ridurle toglierebbe completezza che ha oggi |
| V03-03 identità del downstream Lambda | `@ptr`; una lettura senza identità non si divide (§2.2)                                                                                                                                           |
| V03-04 cache di Watchtower            | `CACHE_FINGERPRINT_VERSION` sale anche per questa specifica (§3)                                                                                                                                  |
| V03-05 test esistenti                 | elencati quelli da aggiornare e i valori che restano (§3)                                                                                                                                         |
| V03-06 esecuzione IPA                 | quella delle 12:08:16 (§1.2, §3)                                                                                                                                                                  |

## Quarto giro di revisione Codex (22 novembre 2026)

Esito: **REVISE**, 2 rilievi medium, verificati e accolti nella v05.

| Rilievo                                                 | Esito nella v05                                                                                                         |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| V04-01 scansioni dirette senza conteggio dei fallimenti | fallimento registrato al confine comune `executeCloudWatchLogsQuery`, anche quando lo step recupera l'errore (§2.2, §3) |
| V04-02 test del contratto dei diagnostici               | `mergeCloudWatchLogsDiagnostics.test.ts` e `QueryLogsaverDiagnosticsStep.test.ts` aggiornati al nuovo contratto (§3)    |

## Approvazione (22 novembre 2026)

Il committente approva la v05 e chiede lo sviluppo.

## Sviluppo (22 novembre 2026)

Scostamenti dalla v05, scelti nello sviluppo:

- **Regex dei trace.** Invece di `(?:1-E-|E)R` la regex scrive le forme di `traceIdForms` come letterali in
  alternativa (`1-E-R|ER`): circa 69 caratteri per trace invece di 49 (oggi 105), le stesse righe, e ogni trace resta
  leggibile nella query (i test e chi legge la query in CloudWatch lo cercano così). `TraceIdFormat.searchPattern` non
  serve.
- **Predicato per valore conservato.** `ServiceLogSpec.tracePatternTemplate` è un'aggiunta facoltativa: un profilo che
  non la dichiara tiene `tracePredicateTemplate` per forma (la documentazione del tipo prevede predicati su campi
  strutturati).
- **Lambda multi-account.** `QueryLambdaAcrossAccountsStep` tiene la sua divisione, che ha già la stessa forma con i
  suoi messaggi e il suo budget di 100; cambia solo la soglia delle invocazioni, al limite effettivo della query.
- **Conteggio delle letture fallite.** Il motore crea per esecuzione `readFailures`, che `executeCloudWatchLogsQuery`
  incrementa quando una lettura fallisce (non per un annullamento) e la traccia riporta: un errore che un chiamante
  trasforma in copertura resta contato.
