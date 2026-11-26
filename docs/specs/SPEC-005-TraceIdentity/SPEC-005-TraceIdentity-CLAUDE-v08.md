# SPEC-005 · go-runbook: un module per l'identità del trace id — v08

- Stato: **bozza**, da approvare.
- Autore: Claude.
- Origine: la revisione architetturale di go-runbook del 20 novembre 2026 (candidato 2, «Trace identity»), scelto dal
  committente il 21 novembre 2026. Le decisioni D1–D4 sono già prese (§6).
- Rispetto alla v07: accoglie RV7-01 del settimo giro di Codex togliendo una regola. `canonicalTraceId` tiene la
  regola di oggi (id diretto o header con `Root=`) per ogni chiamante; i campi dopo `;` dell'access log SEND li toglie
  il pattern del profilo, `Root=([^;\s]+)`, al posto dello `split(';')` dei due step (§3.2). RV7-02, lo step di
  finestra con identificatori opachi, è dichiarato fuori (§5).

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
  discesa lascia `''`, l'enumeratore delle richieste API Gateway pubblica come correlazione il valore grezzo quando
  non è un trace id.
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
- **Profilo API Gateway SEND:** `traceIdExtractPattern` diventa `Root=([^;\s]+)`: `xRayTraceId` è il solo id, senza
  i campi che seguono `;` nell'header.
- **Runbook PNPG:** la query dell'hook `query-national-registries-completion` cerca la forma data, la X-Ray e la
  compatta del trace (`filter (@message like '…' or …)`), e tiene solo le righe del trace seguito.
- **Chi usa `@pagopa/go-runbook`:** esce `apigw.transformRawTraceId`; entra `canonicalTraceId` in
  `@pagopa/go-runbook/toolkits/common`. Breaking change sul prerelease `next`.
- **go-rta-check:** il confronto con le analisi Watchtower riconosce un trace id anche in forma compatta.

## 3. La proposta

### 3.1 Il module `parsing/traceIds`

Il module resta in `toolkits/common/parsing/traceIds/` e ha un'interface di cinque funzioni. Il resto diventa
implementazione, non importata da altri module.

| Funzione                                        | Domanda                                                           |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| `canonicalTraceId(raw)`                         | quale trace è questo valore grezzo? (forma canonica o niente)     |
| `traceIdForms(traceId)`                         | in che forme lo cerco nei log?                                    |
| `traceRowMatcher(traceIds)`                     | questa riga appartiene a uno di questi trace? (attribuzione)      |
| `rowsOfTraces(rows, identifiers, traceField)`   | quali righe di una lettura per trace scarto? (filtro del lettore) |
| `matchTraceIdCandidate(fields, schema, policy)` | quale trace porta questa riga? (scoperta, §3.3)                   |

`readXrayHeaderRoot` e `messageTraceIds` restano file del module, usati solo al suo interno; `transformRawTraceId`
diventa `bareTraceId`, la regola dell'id diretto (§3.2, punto 1) in minuscolo, usata solo dentro il module.
`rowsOfTraces` e `TraceFieldReaderFn` restano come sono oggi. `matchTraceIdCandidate`, `TraceIdCandidateMatch` e
`TraceIdSearchPolicy` passano da `parsing/applicationLogs/` a `parsing/traceIds/`. `TraceIdCandidateMatch` resta
esportato com'è dai namespace `service` (toolkits common, send e interop) e `apigw` di `toolkits/send`: cambia solo
il percorso del file nei re-export; i report API rigenerati lo mostrano in entrambi.

### 3.2 `canonicalTraceId`: la regola di oggi, in minuscolo

Il valore, senza spazi ai bordi, è un trace id quando è:

1. un id diretto: X-Ray (`1-xxxxxxxx-yyyyyyyyyyyyyyyyyyyyyyyy`) o compatto (32 cifre esadecimali), in qualunque
   maiuscolo (`bareTraceId`);
2. altrimenti, un header X-Ray con un campo `Root=` in testa o dopo un `;` (`Root=…;Sampled=1`,
   `Self=…;Root=…;Parent=…`).

È la regola di oggi di `canonicalTraceId`, usata da `rowsOfTraces`, dall'attribuzione e dalla scoperta
`field-or-message`. Il risultato è sempre la forma X-Ray in minuscolo; un valore che non rientra in nessun caso dà
`undefined`.

**L'access log SEND.** Il pattern del profilo, `Root=([^\s]+)`, cattura oggi anche i campi che seguono l'id
(`Root=A;Sampled=1` dà `A;Sampled=1`), e i due step SEND li tolgono con `split(';')`. Il pattern diventa
`Root=([^;\s]+)`: `extractTraceId` restituisce il solo id, `xRayTraceId` lo contiene, e i due step chiamano
`canonicalTraceId` sul valore com'è. Il `canonicalTraceId('Root=' + raw)` di `DescendToServiceStep` sparisce. Un
header `Self=A;Root=B` dà B, come oggi; un valore senza `Root=` resta il valore del campo, come oggi.

I chiamanti decidono solo che cosa fare di un valore che non è un trace:

- `DescendToServiceStep`: `canonicalTraceId(raw) ?? ''`, come oggi;
- `enumerateApiGwRequests`: `safeCorrelationValue(canonicalTraceId(raw) ?? raw)`, come oggi. Un valore che non è un
  trace id resta la correlazione `traceId` del nodo: la detection ne porta il valore nelle osservazioni, e un'analisi
  Watchtower annotata con quel valore lo ritrova per corrispondenza esatta.

### 3.3 `matchTraceIdCandidate`: una sola forma canonica

`matchTraceIdCandidate` tiene le due policy di oggi e la loro differenza sul campo trace:

- `field`: il campo vale solo come id diretto (`bareTraceId`); un header nel campo resta ignorato, come oggi. Le righe
  di un fallback UUID scelgono quindi lo stesso trace di oggi per il secondo tentativo (`traceIdOfFallbackRows`
  prende il primo candidato);
- `field-or-message`: il campo vale in ogni forma di `canonicalTraceId` (id diretto o header con `Root=`), poi il
  messaggio, come oggi. Un campo `A;Sampled=1` non vale come trace e lascia decidere il messaggio.

Il `canonical` è sempre minuscolo, con entrambe le policy e per i due modi di leggere il messaggio; `raw` resta il
token trovato.

La ricerca nel messaggio non cambia regola: un id X-Ray ovunque, un id compatto solo con un'etichetta (`trace_id=…`,
`"traceId":"…"`), per non scambiare per trace un MD5 o un UUID senza trattini.

Il `canonical` arriva anche alla variabile del trace di un ramo letto per fallback UUID: `readTrace` di
`enumerateServiceErrors` riscrive `traceIdContextVar` (`xRayTraceId` per SEND) nei nodi e negli instradamenti di quel
ramo, e `buildApiGwOutputContext` mostra nel report il valore del ramo rappresentativo. Alla radice la variabile resta
il valore estratto dall'access log (§5); nei rami per fallback UUID diventa la forma canonica in minuscolo, anche
quando il campo del log è un id in maiuscolo. La discesa successiva legge quella forma.

### 3.4 `traceRowMatcher`: una regola per l'appartenenza delle righe

```typescript
export function traceRowMatcher(traceIds: ReadonlyArray<string>): (traceField: string, message: string) => boolean;
```

Le forme canoniche dei trace si calcolano una volta, al momento della creazione; il predicato restituito non ha
stato. Una riga appartiene a uno dei trace quando:

- il suo campo trace, senza spazi ai bordi, non è vuoto e la sua forma canonica (o il campo senza spazi, se non è un
  trace id) è uno dei trace;
- il campo, senza spazi ai bordi, è vuoto e il messaggio nomina uno dei trace come token intero (X-Ray o 32 cifre, come `messageTraceIds`).

I chiamanti:

| Chiamante                                        | Campo trace                       | Messaggio                                      |
| ------------------------------------------------ | --------------------------------- | ---------------------------------------------- |
| `attributeTraceRow`                              | `trace_id`                        | `@message`                                     |
| `attributeServiceRow` (identificatore `traceId`) | campo dello schema, o `@` + campo | `@message`, o il messaggio letto con lo schema |

Il filtro dei lettori non cambia: `ServiceTraceLevelReader` e `ServiceLogsLevelReader` usano `rowsOfTraces`, per
ogni template. Una riga il cui campo trace nomina un altro trace è scartata; una riga senza campo trace resta, anche
quando la proiezione di un template personalizzato non ha né il campo né `@message`. Il matcher serve solo
all'attribuzione delle righe di un lotto di più identificatori, come `attributeTraceRow` e `attributeServiceRow`
oggi; la differenza fra lotto singolo e lotto multiplo per una riga senza campo resta com'è (§5).

Una lettura per fallback UUID non cambia: il lettore SEND tiene le righe con il token esatto di uno dei suoi UUID e
non le filtra per trace, come oggi.

### 3.5 Le forme di ricerca nello step di finestra

`QueryServiceLogsStep` cerca un trace id come i lettori dell'albero: le forme di `traceIdForms` del valore di
`xRayTraceId` senza spazi ai bordi. Ogni forma rende il `tracePredicateTemplate` del profilo; i predicati si uniscono
con `or` fra parentesi. La forma data resta fra quelle cercate, quindi la query trova almeno ciò che trova oggi, anche
con un trace scritto in maiuscolo. La lettura per fallback UUID non cambia.

Le righe di una lettura per trace passano da `rowsOfTraces`, con il campo trace dello schema (o `@` + campo), come
nei lettori dell'albero. Una riga il cui `trace_id` nomina un altro trace non entra più nel risultato, anche se il suo
messaggio contiene una forma del trace cercato: per l'hook PNPG, il completamento di un'altra richiesta non vale per
quella seguita. Una riga senza `trace_id` resta, come oggi.

`traceIdForms` non cambia: la forma data, la canonica e la compatta, senza ripetizioni. I lettori dell'albero le
passano l'identificatore della discesa, che è già nella forma canonica.

### 3.6 go-watchtower-runbook

Un request id di 32 cifre esadecimali ha la stessa grafia di un trace compatto: l'equivalenza fra forme vale solo
per gli identificatori del caso che sono trace id. Per questo `DetectedCase.identifiers` porta il tipo delle
osservazioni della detection (`kind` di `IdentifierObservation`). Gli id presi dal contesto dell'output, usati quando
nessuna detection ha osservazioni, restano senza tipo: il nome di un campo non basta (un `cid` INTEROP è pubblicato
come `traceId`).

Un identificatore del caso coincide con un trace id dell'analisi (`pickTrackingExcerpt`, `bestComparison`) quando:

- i due valori sono uguali senza distinguere il maiuscolo, come oggi, per ogni identificatore;
- oppure l'identificatore è un'osservazione `traceId` e le due forme canoniche (`canonicalTraceId`, importata da
  `@pagopa/go-runbook/toolkits/common`) sono definite entrambe e uguali. Due valori che non sono trace id restano
  distinti anche se nessuno dei due ha una forma canonica.

Un request id o un `cid` compatto non coincide quindi con un'annotazione X-Ray dello stesso corpo esadecimale, e un
request id annotato nel campo trace dell'analisi coincide ancora con l'osservazione del request id. `traceIdOverlap`
resta l'elenco dei valori del caso, nella loro forma.

### 3.7 API pubblica, formati e cache

- **`@pagopa/go-runbook`:** esce `apigw.transformRawTraceId` da `toolkits/common`, `toolkits/send` e
  `toolkits/interop`, senza alias; entra `canonicalTraceId` in `toolkits/common`, fra gli export del parsing.
  Changeset major sul prerelease `next`; API report rigenerati.
- **Formati:** l'output e la traccia non cambiano forma; `RUNBOOK_OUTPUT_SCHEMA_VERSION` e la versione della traccia
  restano.
- **Cache RTA:** i valori di alcuni output cambiano (trace id in minuscolo, `xRayTraceId` senza i campi dopo `;`, righe
  dell'hook PNPG); `CACHE_FINGERPRINT_VERSION` di go-watchtower-runbook passa da 15 a 16.

## 4. Test e verifica

- **`canonicalTraceId`:** una tabella di forme grezze (X-Ray e compatta in minuscolo e maiuscolo, header con `Root=`
  in testa e in mezzo, `A;Root=B` che dà B, spazi ai bordi) che dà la stessa forma; valori non validi (`not-a-trace`,
  `Root=` senza id, `Self=…` senza `Root=`, `A;Sampled=1`, 31 o 33 cifre) che danno `undefined`.
- **`traceRowMatcher`:** campo uguale in altra forma o maiuscolo; campo di un altro trace con il messaggio che cita
  quello cercato (non appartiene); campo vuoto o di soli spazi con il trace come token intero (appartiene, anche in un lotto di più trace) e come
  parte di un token più lungo;
  più trace nel matcher.
- **`matchTraceIdCandidate`:** `canonical` minuscolo con `trace_id` in maiuscolo per entrambe le policy, e per un id
  X-Ray in maiuscolo nel messaggio; header nel campo ignorato con la policy `field` e letto con `field-or-message`;
  con `field-or-message`, `trace_id=A;Sampled=1` e un X-Ray B nel messaggio danno B, come oggi (anche in
  `scanApplicationLogs`).
- **Attribuzione:** `attributeTraceRow` e `attributeServiceRow` su un lotto di più trace, con il campo in maiuscolo o
  in forma compatta e con il trace solo nel messaggio.
- **Access log SEND:** `extractTraceId` con il profilo SEND su `Root=A;Parent=…;Sampled=1` dà A, su `Self=A;Root=B`
  dà B; `ParseApiGwErrorsStep` pubblica A in `xRayTraceId`.
- **Step SEND:** `DescendToServiceStep` con un id, un id in maiuscolo e un valore non valido; `enumerateApiGwRequests`
  con una riga `Root=A;Sampled=1` (correlazione canonica) e con un valore non valido, con un request id presente (la
  correlazione `traceId` resta il valore grezzo, come oggi).
- **Filtro dei lettori:** `ServiceTraceLevelReader` con `traceQueryOverride` a filtro esatto e proiezione senza
  `trace_id` né `@message` (le righe restano), e con un `trace_id` di un altro trace (la riga è scartata), come oggi.
- **Fallback UUID, candidati discordanti:** due righe con lo stesso fallback UUID, la prima con `trace_id=Root=A` e la
  seconda con l'id diretto B: il secondo tentativo cerca B, come oggi.
- **Fallback UUID:** il secondo tentativo con un `trace_id` in maiuscolo: l'identificatore della rilettura,
  la variabile `xRayTraceId` del ramo e il valore nel report sono la forma canonica.
- **`QueryServiceLogsStep`:** la query con la forma data, la canonica e la compatta per un trace id in maiuscolo, e
  con il solo predicato per un fallback UUID; una riga con il `trace_id` di un altro trace che contiene nel messaggio
  la forma compatta del trace cercato resta fuori; una riga senza `trace_id` resta; il caso noto PNPG con il
  completamento del solo trace seguito.
- **go-watchtower-runbook:** `pickTrackingExcerpt` e il confronto dei casi con un trace id compatto nell'analisi e
  X-Ray nel caso (coincidono); un request id di 32 cifre nel caso e lo stesso corpo in forma X-Ray nell'analisi (non
  coincidono); un request id uguale nei due (coincide, come oggi); un `cid` compatto preso dal contesto e lo stesso
  corpo in forma X-Ray nell'analisi (non coincidono); due valori opachi diversi in un'osservazione `traceId` e
  nell'analisi (non coincidono), in `pickTrackingExcerpt` e in `bestComparison`.
- **Verifica:** `pnpm check` completo (build, test, coverage, published, lint, format, unused, dependencies,
  duplicates, types, scaffold).

## 5. Fuori da questa specifica

- **`canonicalReadIdentifier` del motore.** Per un `traceId` toglie solo gli spazi. Il motore non conosce X-Ray
  (regola `engine-is-a-foundation`) e oggi nessuna lacuna nomina un trace id; i lettori passano già la forma
  canonica.
- **Righe senza campo trace nel lotto di un solo identificatore.** `rowsOfTraces` le tiene tutte; l'attribuzione di
  un lotto di più identificatori le dà a un trace solo se il messaggio lo nomina come token intero. La differenza
  riguarda una riga il cui messaggio contiene il trace solo dentro un token più lungo. Unificarle scarterebbe righe
  dei template personalizzati la cui proiezione non ha né il campo né `@message`.
- **Trace scritti in maiuscolo nei log, nelle riletture dell'albero.** Oggi la grafia osservata resta una forma di
  ricerca quando arriva com'è all'identificatore della discesa: nel secondo tentativo per fallback UUID e nella
  discesa dall'errore di un servizio con un id X-Ray in maiuscolo nel messaggio (`<prefix>TraceId`). Con la proposta
  l'identificatore è la forma canonica e la rilettura cerca le sole forme in minuscolo. X-Ray genera i trace in
  minuscolo; cercare anche le forme in maiuscolo raddoppierebbe i predicati di lotti fino a 50 trace, già vicini al
  limite di lunghezza di una query Logs Insights. Lo step di finestra, che legge un solo trace, tiene invece la
  grafia data (§3.5). `<prefix>TraceIdRaw` resta la grafia osservata, per il report.
- **`extractTraceId` dell'access log e la variabile `xRayTraceId`.** Restano il valore estratto dal pattern del
  profilo, senza forma canonica: sono generici per prodotto (`cid` di INTEROP non è un trace X-Ray) e compaiono nei
  report. Cambia solo il pattern SEND (§3.2). La forma canonica si calcola dove il valore si confronta o si cerca.
- **`QueryServiceLogsStep` con identificatori opachi.** Lo step è del toolkit SEND e il suo solo uso, l'hook PNPG,
  legge il trace X-Ray dell'access log. Configurato con una variabile che contiene un identificatore opaco (un `cid`)
  e un predicato strutturato, cercherebbe anche la forma X-Ray di un valore di 32 cifre. Nessun runbook lo usa così;
  una distinzione per tipo di identificatore sarebbe macchinario senza un chiamante.
- **Trace dei rami instradati per fallback UUID.** Il trace che `readTrace` scrive in uno pseudo-nodo d'instradamento
  vale per i suoi step; il figlio nasce dal contesto del nodo reale, quindi un nodo trovato a valle per trace eredita
  il trace del nodo d'ingresso. È il comportamento di oggi, indipendente dalla forma del trace; correggerlo tocca la
  propagazione dei contesti nell'albero, non l'identità del trace.
- **Forma compatta dentro un token più lungo, nell'hook PNPG.** Il predicato `like` della forma compatta può
  selezionare una riga senza `trace_id` che contiene le 32 cifre solo dentro un valore più lungo; `rowsOfTraces` la
  tiene, come tiene oggi ogni riga senza campo selezionata dal predicato X-Ray. I log di pn-national-registries
  scrivono `trace_id` sulle righe di completamento, e un valore esadecimale più lungo che contenga proprio il corpo
  del trace seguito è marginale: un vincolo dedicato all'hook sarebbe macchinario per un caso che non si osserva.
- **Regola di scoperta nel messaggio.** Un id compatto senza etichetta resta ignorato da `matchTraceIdCandidate`.

## 6. Le scelte del committente

- **D1 — Perimetro (21 novembre 2026).** Un module con le domande sul trace id: forma canonica di ogni valore
  grezzo, forme di ricerca, appartenenza di una riga; il residuo delle maiuscole si chiude dentro il module. Dalla
  v03 il filtro dei lettori resta una quarta funzione, quella di oggi (§3.4).
- **D2 — `transformRawTraceId` (21 novembre 2026).** Esce dall'API pubblica senza alias, con breaking change sul
  prerelease `next`.
- **D3 — Step di finestra (21 novembre 2026).** `QueryServiceLogsStep` cerca tutte le forme, come l'albero.
- **D4 — Watchtower (21 novembre 2026).** Dentro: `canonicalTraceId` entra nell'API pubblica e go-watchtower-runbook
  lo usa per confrontare i trace id.
