# SPEC-009 · Letture CloudWatch: una scansione per livello, nessuna riga persa — v04

- Stato: **bozza**, da approvare.
- Rispetto alla v03: accoglie i rilievi del terzo giro di Codex (letture fallite contate una per una, budget delle
  divisioni condiviso, identità delle righe del downstream Lambda, cache di Watchtower, test, esecuzione IPA giusta);
  la Lambda multi-account tiene il suo budget.
- Rispetto alla v02: accoglie i 6 rilievi del secondo giro di Codex (attribuzione pura nella divisione, niente tetti
  interni di 50, conteggio delle query, confine multi-account, test della query SEND, fatti).
- Scelte del committente (22 novembre 2026): D1 regex per lotto, D2 `limit 10000`, D3 divisione con 10 query in più,
  D4 execution log con tutte le righe.
- Autore: Claude.
- Origine: l'esecuzione di `pn-delivery-B2B-ApiGwAlarm` del 25 ottobre 2026 (23:01:45Z): 8 query, circa 1,9 GB
  scansionati, 3 letture sature e 2.513 righe di pn-external-registries corrispondenti al filtro e mai restituite.

## 1. Perché

### 1.1 Le query dell'esecuzione

| Lettura                                                 | Query       | MB per query | Righe trovate / restituite    | Esito                                                      |
| ------------------------------------------------------- | ----------- | ------------ | ----------------------------- | ---------------------------------------------------------- |
| Access log API Gateway                                  | 1           | 16           | 113 / 113                     | completa                                                   |
| Execution log API Gateway (113 request id, lotti di 50) | 3 tentativi | —            | —                             | tutti rifiutati (retention del log group); una sola lacuna |
| pn-delivery (113 trace, lotti di 50)                    | 3           | 350          | 181 + 94 + 3                  | complete                                                   |
| pn-external-registries (99 trace, lotti di 50)          | 2           | 438          | 2.914 + 1.599 / 1.000 + 1.000 | **sature**                                                 |
| Lambda di versioning (sonda della finestra)             | 1           | 2            | 7.611 / 1.000                 | **satura**                                                 |

### 1.2 Una query scansiona tutto il log group della finestra

CloudWatch Logs Insights scansiona, e fattura, tutti gli eventi del log group nell'intervallo, qualunque sia il
filtro. Ogni lotto in più ripete la stessa scansione: pn-delivery è scansionato 3 volte (1.050 MB) e
pn-external-registries 2 volte (876 MB). Con un lotto per livello sarebbero 788 MB invece di 1.926.

I lotti sono di 50 identificatori fissi:

- `DEFAULT_BATCH_SIZE = 50` in `engine/tree/ErrorTreeExecutor.ts` (le letture dei livelli; `TreeLevel.batchSize` lo
  cambia per livello);
- `maxRequestIds: 50` del profilo SEND per l'execution log, letto da `readCloudWatchLogsBatches`;
- `TRACE_BATCH_SIZE = 50` di `createServiceAlarmRunbook` per ogni query di trace a lotti: l'esecuzione IPA del 22 novembre (12:08:16) fa 9 scansioni da 215 MB per 422 trace `traceId:<uuid>`, che con la regex stanno in 2 query.

Il vero limite è la lunghezza della query: `StartQuery` accetta al massimo 10.000 caratteri. Oggi ogni trace X-Ray
entra in due forme (`traceIdForms`: `1-6ade89e7-1881f1cf24c5edf61cb105cf` e `6ade89e71881f1cf24c5edf61cb105cf`),
ognuna con il suo predicato `(@message like '…')`: circa 105 caratteri per trace, quindi al massimo circa 90 trace per
query.

### 1.3 Il limite di 1.000 righe perde evidenza

Quasi tutte le query del package hanno `| limit 1000` (21 testi), e così le query per servizio dei runbook (7 limiti
in 6 file dell'inventario, con il loro `{{FILTER_CLAUSE}}`). Il limite non cambia i byte scansionati.

Su pn-external-registries la query del runbook (`EXTERNAL_REGISTRIES_QUERY` in `knownServices.ts`) prende le righe
`ERROR` **e** le righe `Invoking external service Selfcare`, che fanno da contesto: CloudWatch ne trova 4.513 per 99
trace e ne restituisce 2.000. Le catene di quei trace restano «evidenza incompleta» (31 nell'esecuzione).

Il limite reale di Insights: una query restituisce le righe a pagine di 10.000 (`GetQueryResults` con `nextToken`) e
la documentazione AWS del comando `limit` ammette fino a 100.000 righe; `AWSCloudWatchLogsService` sa già leggere le
pagine successive (lo usa il percorso multi-account). La query non può superare 10.000 caratteri.

`QueryLambdaAcrossAccountsStep` divide già in due un lotto saturo entro un budget (`MAX_SPLIT_QUERIES = 100`); una metà
ancora incompleta recupera dal lotto saturo le righe dei propri identificatori, senza doppioni. Le letture dell'albero
e `readCloudWatchLogsBatches` non dividono.

## 2. La proposta

### 2.1 Un lotto quanto la query lo consente

- `TreeLevelReader` ha un metodo facoltativo `batches(identifiers)`: divide gli identificatori di un livello nei lotti
  da leggere. Senza il metodo resta il lotto fisso (`batchSize`, 50 per difetto).
- `CloudWatchLogsLevelReader` lo implementa: riempie un lotto finché la query (`this.query(batch)`) resta entro
  10.000 caratteri; `TreeLevel.batchSize`, se dichiarato, resta un tetto. `readCloudWatchLogsBatches` fa lo stesso:
  `batchSize` diventa facoltativo e, se c'è, è un tetto.
- I tetti interni di 50 si tolgono: `TRACE_BATCH_SIZE` di `createServiceAlarmRunbook` (resta 1 per i template che
  interpolano un solo id) e `maxRequestIds` del profilo SEND (l'override esplicito di un runbook resta). I 113 request
  id dell'execution log B2B stanno in una query (circa 6.600 caratteri).
- Il predicato dei trace si accorcia senza cambiare che cosa trova. Oggi un valore cerca, come sottostringa e
  rispettando maiuscole e minuscole, il valore ricevuto e le forme di `traceIdForms` (per X-Ray la canonica
  `1-6ade89e7-1881f1cf24c5edf61cb105cf` e la compatta `6ade89e71881f1cf24c5edf61cb105cf`). Diventa una sola regex per
  lotto, `@message like /a|b|…/`, con un'alternativa per valore:
  - `TraceIdFormat.searchPattern(canonical)` restituisce la regex che riconosce esattamente le sue forme di ricerca:
    per X-Ray `(?:1-6ade89e7-|6ade89e7)1881f1cf24c5edf61cb105cf` (49 caratteri invece di circa 105);
  - il valore ricevuto, quando è diverso dalla forma canonica (maiuscole, header, valore opaco), si aggiunge come
    letterale protetto per la regex di Insights;
  - `fallbackUuid` tiene il suo predicato (`fallbackPredicateTemplate`).
- Le ricerche che usano questo rendering: `ServiceLogsLevelReader` e `QueryServiceLogsStep` (l'hook di completamento
  PNPG) con il profilo SEND, che passa da un predicato per valore (`tracePredicateTemplate`) a un template del lotto;
  `ServiceTraceLevelReader`. Gli override per servizio tengono il loro `{{FILTER_CLAUSE}}` e i loro filtri di contesto.

Nell'esecuzione: 113 trace in circa 5.700 caratteri, una query per pn-delivery e una per pn-external-registries.

### 2.2 Nessuna riga persa

- **Limite delle righe** (D2): le query per identificatore passano a `| limit 10000`, una pagina di `GetQueryResults`,
  compresi i 7 limiti degli override dell'inventario. Le scansioni della finestra restano come sono.
- **Divisione dentro la lettura** (D3). Un lotto ancora saturo si divide in due e si rilegge, entro 10 riletture per
  esecuzione. Il budget è uno solo per esecuzione: lo crea il motore e lo condividono i livelli dell'albero e le
  letture a lotti di tutti gli step; conta le letture logiche (una rilettura su più log group o profili candidati è
  una). La divisione la divisione sta nella lettura (`CloudWatchLogsLevelReader.read`, `readCloudWatchLogsBatches`), che
  restituisce un solo esito.
  - Il contratto della divisione ha due funzioni pure: l'**appartenenza** di una riga a un identificatore e
    l'**identità** di una riga. I livelli usano `TreeLevel.attribute` e `rowIdentity`; il livello del downstream
    Lambda (`createLambdaAlarmRunbook`), che oggi non dichiara `rowIdentity`, dichiara `@ptr`. Una lettura senza
    identità non si divide: resta `saturated`, come oggi. Le letture a lotti dichiarano: il campo `cid` per INTEROP, il request id per la Lambda, il prefisso `(<requestId>)` per l'execution
    log, il request id per `QueryStreamLambdaLogsStep`.
  - Le righe di un identificatore riletto completamente sono quelle delle metà; per un identificatore ancora
    incompleto si uniscono, senza doppioni, le righe del lotto saturo che gli appartengono e quelle delle metà; se le
    riletture falliscono restano le righe del lotto saturo.
  - La copertura nomina solo gli identificatori ancora incompleti (`StepCoverage.identifiers`): il ledger rende
    `queried` le discese lette completamente dalle metà e lascia la lacuna sulle altre.
  - I diagnostici conservano tutte le query con statistiche, compresa quella del lotto saturo.
- **Callback dei chiamanti.** `rowsOf` si chiama una sola volta per lotto finale, sulle righe definitive (comprese
  quelle recuperate dal lotto saturo): il tracker dei CID di INTEROP, che accumula una voce per CID in `rowsOf`, ne
  ha una sola per CID.
- **Lambda multi-account.** `QueryLambdaAcrossAccountsStep` condivide la divisione al livello del lotto ma tiene il
  suo budget di 100 riletture (`MAX_SPLIT_QUERIES`): portarlo a 10 toglierebbe completezza che ha oggi; restano sue
  l'aggregazione per sorgente, la copertura per account e la decisione di fallire dopo aver letto tutti gli account
  (annullamenti ed errori di configurazione del target si propagano subito). Le invocazioni usano il limite effettivo
  della query; la scansione degli errori non cambia (limite e soglia di 1.000).
- **Il conteggio delle query.** La telemetria conta le query con statistiche (come oggi) e, a parte, le letture
  fallite, una per lotto: `readCloudWatchLogsBatches` registra ogni lotto fallito prima di accorparne gli errori, e
  la telemetria si pubblica anche quando falliscono tutti. `mergeCloudWatchLogsDiagnostics` somma le statistiche
  disponibili invece di scartarle tutte quando ne manca una. Sono le letture viste da go-runbook, non i tentativi
  interni di `AWSCloudWatchLogsService`: una `StartQuery` rifiutata o un polling fallito non hanno statistiche e oggi spariscono dal conteggio
  (`AWSCloudWatchLogsService` non restituisce i diagnostici di una query fallita). «Runbook Result» mostra
  `CloudWatch queries: 7 (1 fallita)`; i byte si sommano dalle sole statistiche disponibili (D5).
- **Execution log.** Tiene tutte le righe: i casi di quattro runbook leggono righe diverse (`Execution failed due to
configuration error`, `Lambda invocation failed with status: 500.`, `AUTHORIZER_CONFIGURATION_ERROR`, …) e
  `pn-delivery-IO_EXP-ApiGwAlarm` ne legge l'output direttamente. Cambiano solo lotti e limite.

### 2.3 Che cosa cambia nei risultati

- Meno query e meno byte scansionati per le stesse righe.
- Più righe: pn-external-registries passa da 2.000 a 4.513 righe trovate (errori e righe di contesto). **Senza la discesa una volta per richiesta (punto 3,
  fuori da questa specifica), i nodi copiati crescono con le righe**: circa ×2,25 nell'esecuzione, insieme alla
  traccia. I conteggi restano corretti (errori distinti).

## 3. Test e verifica

- Lotti: con 113 trace X-Ray un solo lotto; con identificatori oltre i 10.000 caratteri più lotti, ognuno entro il
  limite; `batchSize` resta un tetto.
- Regex: per ogni formato `searchPattern` riconosce come sottostringa tutte e sole le forme di `traceIdForms`; un
  valore misto maiuscolo e minuscolo, un header e un valore opaco si trovano come oggi; i caratteri speciali di un
  letterale sono protetti; `fallbackUuid` resta il suo predicato. Le asserzioni sulla forma della query di
  `QueryServiceLogsStep` (predicati tra apici, tre predicati in `or`) diventano asserzioni sulla regex: valore
  originale, forma canonica e compatta presenti; l'attribuzione delle righe e il predicato `fallbackUuid` restano
  verificati come oggi.
- Divisione: due metà complete rendono `queried` le discese e la telemetria conta tre scansioni; una metà incompleta
  tiene le righe del lotto saturo per i suoi identificatori, senza doppioni; riletture fallite lasciano l'evidenza del
  lotto saturo; a budget esaurito il lotto resta `saturated`; il tracker dei CID ha una voce per CID.
- Lambda multi-account: le invocazioni si dividono con il limite effettivo; la scansione degli errori è invariata; un
  account che fallisce non scarta le invocazioni lette negli altri.
- Lotti: i 422 trace dell'esecuzione IPA delle 12:08:16 in 2 query, ognuna entro 10.000 caratteri; 113 request id dell'execution log B2B in una query.
- Telemetria: una `StartQuery` rifiutata conta come lettura fallita, senza byte; tre lotti rifiutati sono tre letture
  fallite; una rilettura riuscita accanto a una fallita tiene le sue statistiche.
- Budget: più lettori nella stessa esecuzione si fermano insieme a 10 riletture; la Lambda multi-account a 100.
- Identità: il downstream Lambda fonde lettura e rilettura per `@ptr`; una lettura senza identità resta `saturated`.
- Test esistenti aggiornati: le asserzioni sui predicati tra apici di `QueryServiceLogsStep`, `ServiceTraceLevelReader`
  e del runbook `pn-external-registries-IO-downstream-detection-Alarm` diventano asserzioni sulla regex; quelle di
  `lambdaLogReader` sul limite delle invocazioni passano a 10.000 e restano a 1.000 per la scansione degli errori e a
  100 per il budget multi-account.
- Cache di Watchtower: `CACHE_FINGERPRINT_VERSION` sale anche per questa specifica (il fingerprint non vede il
  comportamento delle letture); un risultato salvato prima si rilegge.
- `pnpm check` verde. Nell'esecuzione del 25 ottobre rifatta dal committente si confrontano, per ogni lettura, righe
  trovate da CloudWatch, righe restituite, righe attribuite ai trace e righe `ERROR` per livello: le prime due coincidono su
  pn-external-registries, e la sezione «Runbook Result» mostra meno query e meno byte.

## 4. Fuori

- La discesa una volta per richiesta (il punto 3): nodi e traccia.
- Le scansioni della finestra (access log, sonde come la Lambda di versioning, scansioni d'errore): il loro limite
  resta. La sonda di versioning satura (7.611 righe che contengono `ERROR` o un timeout in 10 minuti) va guardata a
  parte.
- L'execution log fallito per la retention del log group.

## 5. Le scelte del committente

- **D1 — Predicato del trace (22 novembre 2026).** Una regex per lotto (2.1).
- **D2 — Limite delle righe (22 novembre 2026).** `limit 10000`, una pagina, sulle query per identificatore e sugli
  override.
- **D3 — Divisione dei lotti saturi (22 novembre 2026).** Sì, dentro la lettura, con 10 riletture per esecuzione,
  condivise da tutti i lettori; la Lambda multi-account tiene le sue 100.
- **D4 — Execution log (22 novembre 2026).** Tutte le righe; cambiano solo lotti e limite.
- **D5 — Query fallite nel conteggio (22 novembre 2026).** In go-runbook, dalle letture fallite, senza toccare
  `@pagopa/go-aws`.
