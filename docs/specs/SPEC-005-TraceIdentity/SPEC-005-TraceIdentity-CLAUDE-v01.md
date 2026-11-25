# SPEC-005 · go-runbook: un module per l'identità del trace id — v01

- Stato: **bozza**, da approvare.
- Autore: Claude.
- Origine: la revisione architetturale di go-runbook del 20 novembre 2026 (candidato 2, «Trace identity»), scelto dal
  committente il 21 novembre 2026. Le decisioni D1–D4 sono già prese (§6).

## 1. Perché

### 1.1 Una domanda, otto chiamanti, regole diverse

"Questi due valori sono lo stesso trace?" e "in che forme lo cerco nei log?" si decidono oggi in otto punti di
`packages/go-runbook/src` e in due di `packages/go-watchtower-runbook/src`. I pezzi stanno in
`toolkits/common/parsing/traceIds/` e sono testati uno per uno; le differenze stanno nel modo in cui i chiamanti li
compongono.

| Punto                                                                          | Che cosa fa oggi                                                                                    |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `parsing/traceIds/canonicalTraceId.ts`                                         | forma canonica in minuscolo di un id X-Ray, di un id compatto a 32 cifre o di un header con `Root=` |
| `parsing/traceIds/transformRawTraceId.ts`                                      | id X-Ray o compatto in forma X-Ray, **senza** convertire in minuscolo; esportato nell'API pubblica  |
| `parsing/applicationLogs/matchTraceIdCandidate.ts`                             | policy `field`: `transformRawTraceId`, quindi il `canonical` resta in maiuscolo se il log lo è      |
| `matchTraceIdCandidate.ts`, ricerca nel messaggio                              | un id X-Ray nel messaggio è restituito com'è (`canonical: xray`), senza minuscolo                   |
| `send/families/apigw/tree/DescendToServiceStep.ts`                             | `canonicalTraceId(raw.split(';')[0]) ?? canonicalTraceId('Root=' + raw) ?? ''`                      |
| `send/families/apigw/tree/enumerateApiGwRequests.ts`                           | `canonicalTraceId(raw.split(';')[0]) ?? raw`: il ripiego è il valore grezzo, non `''`               |
| `common/families/service/tree/attributeTraceRow.ts`                            | la riga appartiene al trace: campo `trace_id`, il messaggio solo senza campo                        |
| `send/families/apigw/tree/serviceLogRows.ts` · `attributeServiceRow`           | le stesse quattro righe, con il campo dello schema                                                  |
| `parsing/traceIds/rowsOfTraces.ts`                                             | filtro del lettore: tiene **ogni** riga senza campo, senza guardare il messaggio                    |
| `send/families/apigw/steps/QueryServiceLogsStep.ts`                            | cerca il valore grezzo di `xRayTraceId` in una sola forma                                           |
| `go-watchtower-runbook` · `extractAnalysisEvidence.ts` (`pickTrackingExcerpt`) | confronta i trace id delle analisi con `toLowerCase`                                                |
| `go-watchtower-runbook` · `comparison/matchAnalysis.ts` (`bestComparison`)     | come sopra, per la sovrapposizione dei trace id                                                     |

### 1.2 Le divergenze concrete

- **Maiuscole (il residuo).** `canonicalTraceId` converte in minuscolo dal 20 novembre; `matchTraceIdCandidate`, con
  la policy `field` usata dai livelli dell'albero, dalla correlazione e dal secondo tentativo per fallback UUID, usa
  ancora `transformRawTraceId`. Un `trace_id` scritto in maiuscolo produce un `canonical` in maiuscolo: diventa la
  correlazione del nodo, la variabile `<prefix>TraceId` e l'identificatore della rilettura per trace.
- **Lo split dei chiamanti.** Due step tolgono da sé i campi dopo `;` (`1-…;Sampled=1`), con due ripieghi diversi: la
  discesa lascia `''`, l'enumeratore delle richieste API Gateway pubblica come correlazione il valore grezzo, anche
  quando non è un trace id.
- **Tre copie di "la riga è del trace".** `attributeTraceRow` e `attributeServiceRow` ripetono la stessa regola;
  `rowsOfTraces` ne applica una terza, più larga: una riga senza campo trace resta sempre. Con un lotto di un solo
  identificatore il motore usa le righe del lettore così come sono (`ErrorTreeExecutor`, `batch.length === 1`); con
  un lotto di più identificatori le divide con l'attribuzione. Una riga senza campo, il cui messaggio contiene il
  trace solo come parte di un token più lungo (la query è un `like`), appartiene al nodo nel primo caso e a nessun
  nodo nel secondo.
- **Forme di ricerca.** I lettori dell'albero (`ServiceLogsLevelReader`, `ServiceTraceLevelReader`) cercano la forma
  X-Ray e quella compatta (`traceIdForms`); lo step di finestra `QueryServiceLogsStep`, usato dall'hook
  `query-national-registries-completion` del runbook PNPG, cerca solo il valore grezzo. Un servizio che scrive il
  trace in forma compatta non viene trovato.
- **Confronti di Watchtower.** `go-watchtower-runbook` riconosce lo stesso trace solo se cambia il maiuscolo: un
  trace id annotato in forma compatta in un'analisi non coincide con la sua forma X-Ray nel caso rilevato.
- **API pubblica.** `apigw.transformRawTraceId` è esportato da `@pagopa/go-runbook/toolkits/common`, `/toolkits/send`
  e `/toolkits/interop`; nessuno script del repository lo usa ed è la sola normalizzazione che non converte in
  minuscolo.

## 2. Che cosa vede chi usa il repository

- **Autori di runbook:** nessun cambiamento di configurazione. I trace id prodotti dal toolkit sono sempre nella
  forma canonica in minuscolo (`<prefix>TraceId`, correlazione dei nodi, identificatori delle discese); le variabili
  `…TraceIdRaw` restano il valore trovato nel log.
- **Runbook PNPG:** la query dell'hook `query-national-registries-completion` cerca entrambe le forme del trace
  (`filter (@message like '<x-ray>' or @message like '<compatta>')`).
- **Chi usa `@pagopa/go-runbook`:** esce `apigw.transformRawTraceId`; entra `canonicalTraceId` in
  `@pagopa/go-runbook/toolkits/common`. Breaking change sul prerelease `next`.
- **go-rta-check:** il confronto con le analisi Watchtower riconosce un trace id anche in forma compatta.

## 3. La proposta

### 3.1 Il module `parsing/traceIds`

Il module resta in `toolkits/common/parsing/traceIds/` e ha un'interface di tre funzioni. Il resto diventa
implementazione, non importata da altri module.

| Funzione                    | Domanda                                                       |
| --------------------------- | ------------------------------------------------------------- |
| `canonicalTraceId(raw)`     | quale trace è questo valore grezzo? (forma canonica o niente) |
| `traceIdForms(traceId)`     | in che forme lo cerco nei log?                                |
| `traceRowMatcher(traceIds)` | questa riga appartiene a uno di questi trace?                 |

`readXrayHeaderRoot` e `messageTraceIds` restano file del module, usati solo al suo interno; `transformRawTraceId`
sparisce, assorbito da `canonicalTraceId`; `rowsOfTraces` e `TraceFieldReaderFn` spariscono (§3.4).

### 3.2 `canonicalTraceId`: ogni forma grezza

Il valore, senza spazi ai bordi, è un trace id quando è, nell'ordine:

1. un id X-Ray (`1-xxxxxxxx-yyyyyyyyyyyyyyyyyyyyyyyy`) o compatto (32 cifre esadecimali), in qualunque maiuscolo;
2. un header X-Ray con un campo `Root=` (`Root=…;Sampled=1`, `Self=…;Root=…;Parent=…`);
3. un id come al punto 1 seguito da altri campi dopo `;` (`1-…;Sampled=1`): è il valore che l'access log SEND
   produce con il pattern `Root=([^\s]+)`.

Il risultato è sempre la forma X-Ray in minuscolo; un valore che non rientra in nessun caso dà `undefined`. La regola
del punto 3 sostituisce lo `split(';')` dei due step SEND; il `canonicalTraceId('Root=' + raw)` di
`DescendToServiceStep` sparisce, perché il punto 2 copre già un header che non inizia con `Root=`.

I chiamanti decidono solo che cosa fare di un valore che non è un trace:

- `DescendToServiceStep`: `canonicalTraceId(raw) ?? ''`, come oggi;
- `enumerateApiGwRequests`: `safeCorrelationValue(canonicalTraceId(raw))`. Un valore che non è un trace id non
  diventa più la correlazione `traceId` del nodo: è la stessa regola di `enumerateServiceRootErrors`.

### 3.3 `matchTraceIdCandidate`: una sola forma canonica

`matchTraceIdCandidate` usa `canonicalTraceId` per il campo trace con entrambe le policy, e per i due modi di
leggere il messaggio. Il `canonical` è sempre minuscolo; `raw` resta il token trovato.

La differenza fra le policy resta una sola: `field` non legge il messaggio, `field-or-message` sì. Con `field`, oggi
un header X-Ray nel campo trace è ignorato; con la proposta vale come trace. È un ampliamento: nessun campo che oggi
dà un trace ne dà uno diverso.

La ricerca nel messaggio non cambia regola: un id X-Ray ovunque, un id compatto solo con un'etichetta (`trace_id=…`,
`"traceId":"…"`), per non scambiare per trace un MD5 o un UUID senza trattini.

### 3.4 `traceRowMatcher`: una regola per l'appartenenza delle righe

```typescript
export function traceRowMatcher(traceIds: ReadonlyArray<string>): (traceField: string, message: string) => boolean;
```

Le forme canoniche dei trace si calcolano una volta, al momento della creazione; il predicato restituito non ha
stato. Una riga appartiene a uno dei trace quando:

- il suo campo trace non è vuoto e la sua forma canonica (o il campo com'è, se non è un trace id) è uno dei trace;
- il campo è vuoto e il messaggio nomina uno dei trace come token intero (X-Ray o 32 cifre, come `messageTraceIds`).

I chiamanti:

| Chiamante                                        | Campo trace                       | Messaggio                                      |
| ------------------------------------------------ | --------------------------------- | ---------------------------------------------- |
| `attributeTraceRow`                              | `trace_id`                        | `@message`                                     |
| `attributeServiceRow` (identificatore `traceId`) | campo dello schema, o `@` + campo | `@message`, o il messaggio letto con lo schema |
| `ServiceTraceLevelReader.read`                   | come `attributeTraceRow`          | come `attributeTraceRow`                       |
| `ServiceLogsLevelReader.read` (lotto per trace)  | come `attributeServiceRow`        | come `attributeServiceRow`                     |

I due lettori filtrano le righe del lotto con il matcher dei trace del lotto, al posto di `rowsOfTraces`. Effetto:
le righe di un lotto di un solo identificatore sono le stesse che l'attribuzione darebbe a quell'identificatore in un
lotto di più identificatori. Una riga senza campo trace, il cui messaggio non nomina il trace come token intero, non
appartiene più al nodo anche quando il lotto ha un solo identificatore.

Una lettura per fallback UUID non cambia: il lettore SEND tiene le righe con il token esatto di uno dei suoi UUID e
non le filtra per trace, come oggi.

### 3.5 Le forme di ricerca nello step di finestra

`QueryServiceLogsStep` cerca un trace id come i lettori dell'albero: le forme di `traceIdForms` della forma canonica
del valore di `xRayTraceId` (o del valore com'è, se non è un trace id). Ogni forma rende il
`tracePredicateTemplate` del profilo; i predicati si uniscono con `or` fra parentesi. La lettura per fallback UUID
non cambia. La visita registrata (`apiGwServiceVisitVars`) e il reporter mostrano la forma canonica.

`traceIdForms` non cambia: la forma data, la canonica e la compatta, senza ripetizioni. I chiamanti le passano la
forma canonica.

### 3.6 go-watchtower-runbook

`pickTrackingExcerpt` e `bestComparison` confrontano gli identificatori con una chiave unica:
`canonicalTraceId(id) ?? id.toLowerCase()`, importata da `@pagopa/go-runbook/toolkits/common`. Gli identificatori
che non sono trace id (request id, fallback UUID, `cid`) si confrontano come oggi; un trace id coincide con sé
stesso in ogni forma e maiuscolo. `traceIdOverlap` resta l'elenco degli identificatori del caso, nella loro forma.

### 3.7 API pubblica, formati e cache

- **`@pagopa/go-runbook`:** esce `apigw.transformRawTraceId` da `toolkits/common`, `toolkits/send` e
  `toolkits/interop`, senza alias; entra `canonicalTraceId` in `toolkits/common`, fra gli export del parsing.
  Changeset major sul prerelease `next`; API report rigenerati.
- **Formati:** l'output e la traccia non cambiano forma; `RUNBOOK_OUTPUT_SCHEMA_VERSION` e la versione della traccia
  restano.
- **Cache RTA:** i valori di alcuni output cambiano (trace id in minuscolo, correlazione delle richieste, righe
  dell'hook PNPG, righe senza campo trace); `CACHE_FINGERPRINT_VERSION` di go-watchtower-runbook passa da 15 a 16.

## 4. Test e verifica

- **`canonicalTraceId`:** una tabella di forme grezze (X-Ray e compatta in minuscolo e maiuscolo, header con `Root=`
  in testa e in mezzo, id seguito da `;Sampled=1`, spazi ai bordi) che dà la stessa forma; valori non validi
  (`not-a-trace`, `Root=` senza id, `Self=…` senza `Root=`, 31 o 33 cifre) che danno `undefined`.
- **`traceRowMatcher`:** campo uguale in altra forma o maiuscolo; campo di un altro trace con il messaggio che cita
  quello cercato (non appartiene); campo vuoto con il trace come token intero e come parte di un token più lungo;
  più trace nel matcher.
- **`matchTraceIdCandidate`:** `canonical` minuscolo con `trace_id` in maiuscolo per entrambe le policy, e per un id
  X-Ray in maiuscolo nel messaggio; header nel campo con la policy `field`.
- **Albero:** lotto di un solo trace con una riga senza campo che contiene il trace solo dentro un token più lungo
  (la riga non arriva al nodo), per `ServiceTraceLevelReader` e `ServiceLogsLevelReader`.
- **Step SEND:** `DescendToServiceStep` con `1-…;Sampled=1`, `Self=…;Root=…` e un valore non valido;
  `enumerateApiGwRequests` con un valore non valido (nessuna correlazione `traceId`).
- **`QueryServiceLogsStep`:** la query con le due forme per un trace id e con il solo predicato per un fallback UUID.
- **go-watchtower-runbook:** `pickTrackingExcerpt` e il confronto dei casi con un trace id compatto nell'analisi e
  X-Ray nel caso.
- **Verifica:** `pnpm check` completo (build, test, coverage, published, lint, format, unused, dependencies,
  duplicates, types, scaffold).

## 5. Fuori da questa specifica

- **`canonicalReadIdentifier` del motore.** Per un `traceId` toglie solo gli spazi. Il motore non conosce X-Ray
  (regola `engine-is-a-foundation`) e oggi nessuna lacuna nomina un trace id; i lettori passano già la forma
  canonica.
- **Template personalizzati di `ServiceTraceLevelReader`.** Un template senza il predicato standard riceve un solo
  trace id nella forma data: il predicato lo sceglie l'autore del template.
- **`extractTraceId` dell'access log e la variabile `xRayTraceId`.** Restano il valore estratto dal pattern del
  profilo: sono generici per prodotto (`cid` di INTEROP non è un trace X-Ray) e compaiono nei report. La forma
  canonica si calcola dove il valore si confronta o si cerca.
- **Regola di scoperta nel messaggio.** Un id compatto senza etichetta resta ignorato da `matchTraceIdCandidate`.

## 6. Le scelte del committente

- **D1 — Perimetro (21 novembre 2026).** Un module con tre domande: forma canonica di ogni valore grezzo, forme di
  ricerca, appartenenza di una riga; il residuo delle maiuscole si chiude dentro il module.
- **D2 — `transformRawTraceId` (21 novembre 2026).** Esce dall'API pubblica senza alias, con breaking change sul
  prerelease `next`.
- **D3 — Step di finestra (21 novembre 2026).** `QueryServiceLogsStep` cerca tutte le forme, come l'albero.
- **D4 — Watchtower (21 novembre 2026).** Dentro: `canonicalTraceId` entra nell'API pubblica e go-watchtower-runbook
  lo usa per confrontare i trace id.
