# SPEC-009 · Letture CloudWatch: una scansione per livello, nessuna riga persa — v01

- Stato: **bozza**, da approvare.
- Autore: Claude.
- Origine: l'esecuzione di `pn-delivery-B2B-ApiGwAlarm` del 25 ottobre 2026 (23:01:45Z): 8 query, circa 1,9 GB
  scansionati, 3 letture sature e 2.513 righe d'errore di pn-external-registries mai lette.

## 1. Perché

### 1.1 Le query dell'esecuzione

| Lettura                                        | Query | MB per query | Righe trovate / restituite    | Esito                             |
| ---------------------------------------------- | ----- | ------------ | ----------------------------- | --------------------------------- |
| Access log API Gateway                         | 1     | 16           | 113 / 113                     | completa                          |
| Execution log API Gateway (113 request id)     | 1     | —            | —                             | fallita (retention del log group) |
| pn-delivery (113 trace, lotti di 50)           | 3     | 350          | 181 + 94 + 3                  | complete                          |
| pn-external-registries (99 trace, lotti di 50) | 2     | 438          | 2.914 + 1.599 / 1.000 + 1.000 | **sature**                        |
| Lambda di versioning (sonda della finestra)    | 1     | 2            | 7.611 / 1.000                 | **satura**                        |

### 1.2 Una query scansiona tutto il log group della finestra

CloudWatch Logs Insights scansiona, e fattura, tutti gli eventi del log group nell'intervallo, qualunque sia il
filtro. Ogni lotto in più ripete la stessa scansione: pn-delivery è scansionato 3 volte (1.050 MB) e
pn-external-registries 2 volte (876 MB). Con un lotto per livello sarebbero 788 MB invece di 1.926.

I lotti sono di 50 identificatori fissi:

- `DEFAULT_BATCH_SIZE = 50` in `engine/tree/ErrorTreeExecutor.ts` (le letture dei livelli; `TreeLevel.batchSize` lo
  cambia per livello);
- `maxRequestIds: 50` del profilo SEND per l'execution log, letto da `readCloudWatchLogsBatches`.

Il vero limite è la lunghezza della query: `StartQuery` accetta al massimo 10.000 caratteri. Oggi ogni trace X-Ray
entra in due forme (`traceIdForms`: `1-6ade89e7-1881f1cf24c5edf61cb105cf` e `6ade89e71881f1cf24c5edf61cb105cf`),
ognuna con il suo predicato `(@message like '…')`: circa 105 caratteri per trace, quindi al massimo circa 90 trace per
query.

### 1.3 Il limite di 1.000 righe perde errori

Le query per identificatore hanno `| limit 1000`, come quasi tutte le query del package (21 testi). Insights ne consente fino a 10.000, e il
limite non cambia i byte scansionati. Su pn-external-registries le righe `ERROR` sono 4.513 per 99 trace: ne arrivano
2.000. Le catene di quei trace restano «evidenza incompleta» (31 nell'esecuzione) e i casi noti non vedono metà degli
errori.

`QueryLambdaAcrossAccountsStep` divide già in due un lotto saturo e lo rilegge, entro un budget di query in più
(`MAX_SPLIT_QUERIES = 100`); le letture dell'albero e `readCloudWatchLogsBatches` non lo fanno.

## 2. La proposta

### 2.1 Un lotto quanto la query lo consente

- `TreeLevelReader` ha un metodo facoltativo `batches(identifiers)`: divide gli identificatori di un livello nei lotti
  da leggere. Senza il metodo resta il lotto fisso (`batchSize`, 50 per difetto).
- `CloudWatchLogsLevelReader` lo implementa: riempie un lotto finché la query (`this.query(batch)`) resta entro
  10.000 caratteri; `TreeLevel.batchSize`, se dichiarato, resta un tetto.
- `readCloudWatchLogsBatches` fa lo stesso: `batchSize` diventa un tetto e il lotto si chiude sulla lunghezza della
  query.
- Il predicato di un trace si accorcia: `TraceIdFormat` dichiara `searchPattern(canonical)`, una regex che riconosce
  tutte le sue forme di ricerca. Per X-Ray `6ade89e7-?1881f1cf24c5edf61cb105cf` riconosce la forma canonica e quella
  compatta (34 caratteri invece di circa 105). I lettori di trace (`ServiceLogsLevelReader` con il profilo SEND,
  `ServiceTraceLevelReader`) scrivono un solo filtro `@message like /p1|p2|…/` per tutto il lotto.
- Il profilo SEND passa da `tracePredicateTemplate` (un predicato per valore) a un template del lotto con la regex;
  gli override per servizio (`queryOverride`) mantengono il loro `{{FILTER_CLAUSE}}`.

Nell'esecuzione: 113 trace in circa 4.000 caratteri, una query per pn-delivery e una per pn-external-registries.

### 2.2 Nessuna riga persa

- Le query per identificatore (livelli dell'albero, execution log, letture a lotti) passano a `| limit 10000`.
  Costano gli stessi byte: cambiano solo le righe restituite.
- Un lotto ancora saturo a 10.000 righe si divide in due e si rilegge, come fa `QueryLambdaAcrossAccountsStep`, entro
  un budget di query in più per esecuzione (D3). Ogni divisione è una scansione completa del log group; a budget
  esaurito il lotto resta `saturated`, come oggi.
- La logica della divisione sta in un solo posto: `CloudWatchLogsLevelReader` e `readCloudWatchLogsBatches` la usano.
  `QueryLambdaAcrossAccountsStep` la adotta, se ne ha la stessa forma, senza cambiare il comportamento.
- L'execution log **tiene tutte le righe**: i casi di quattro runbook leggono righe diverse (`Execution failed due to
configuration error`, `Lambda invocation failed with status: 500.`, `AUTHORIZER_CONFIGURATION_ERROR`, …) e
  `pn-delivery-IO_EXP-ApiGwAlarm` legge l'output direttamente. Restringere le righe toglierebbe evidenza; basta il
  limite più alto.

### 2.3 Che cosa cambia nei risultati

- Meno query e meno byte scansionati per le stesse righe.
- Più righe: pn-external-registries passa da 2.000 a 4.513 righe. **Senza la discesa una volta per richiesta (punto 3,
  fuori da questa specifica), i nodi copiati crescono con le righe**: circa ×2,25 nell'esecuzione, insieme alla
  traccia. I conteggi restano corretti (errori distinti).

## 3. Test e verifica

- Lotti: con 113 trace X-Ray un solo lotto; con identificatori che superano i 10.000 caratteri più lotti, ognuno entro
  il limite; `batchSize` resta un tetto.
- `searchPattern`: per ogni formato riconosce tutte le forme di `traceIdForms` e nessun altro trace; la regex non
  contiene caratteri da proteggere.
- Query: il filtro del lotto per SEND e per `ServiceTraceLevelReader`; le righe attribuite agli identificatori
  restano le stesse di oggi (test dei livelli e dei runbook esistenti).
- Saturazione: un lotto saturo si divide e le metà sostituiscono la lettura; a budget esaurito il lotto resta
  `saturated`; il ledger registra ogni query.
- `pnpm check` verde; l'esecuzione del 25 ottobre rifatta dal committente mostra meno query, meno byte e nessuna fonte
  satura su pn-external-registries.

## 4. Fuori

- La discesa una volta per richiesta (il punto 3): nodi e traccia.
- Le scansioni della finestra (access log, sonde come la Lambda di versioning, scansioni d'errore): il loro limite
  resta. La sonda di versioning satura (7.611 righe che contengono `ERROR` o un timeout in 10 minuti) va guardata a
  parte.
- L'execution log fallito per la retention del log group.

## 5. Le scelte del committente

- **D1 — Predicato del trace.** Proposta: una regex per lotto con `searchPattern` (2.1). Alternativa: tenere un
  predicato per forma e riempire solo i lotti (circa 90 trace per query: pn-delivery 2 query invece di 3).
- **D2 — Limite delle righe.** Proposta: `limit 10000` sulle query per identificatore (2.2).
- **D3 — Divisione dei lotti saturi.** Proposta: sì, con un budget di 10 query in più per esecuzione (ogni divisione
  rilegge tutto il log group).
- **D4 — Execution log.** Proposta: tutte le righe, solo il limite più alto (2.2).
