# SPEC-011 · Query pronte per tipo di allarme e pattern con Drain in go-report-error-patterns — v03

- Stato: **bozza**, da approvare. Restano aperte D4 (serve una riga di log reale) e D9; sono nuove D10–D13.
- Autore: Claude.
- Origine: richiesta del committente del 25 novembre 2026: rendere facoltativa la query nel file di configurazione e
  sceglierla in base al tipo di allarme, ricavando il `pod_app` dal nome per gli allarmi k8s. La query di riferimento
  è quella condivisa da Gaspare Perricone lo stesso giorno. Richiesta del 26 novembre 2026: ridurre al minimo le query
  su CloudWatch, scaricando una sola volta i log di ogni occorrenza e ricavando i pattern in locale con Drain
  ([drain-ts](https://github.com/AgentiX-E/drain-ts)) al posto del comando `pattern`; dai pattern si ricavano le regex
  che filtrano le righe, e la stabilità locale e globale dei token si verifica in locale con lo stesso criterio usato
  oggi su CloudWatch.
- Rispetto alla v02:
  - **costo delle query**: la misura di quante letture fa oggi un'analisi (§1.5);
  - **motore `drain`**: una sola query per occorrenza che scarica le righe, pattern con un modello Drain per allarme,
    regex dal pattern, stabilità dei token senza query (§3.8–§3.13);
  - **limite delle 10.000 righe** di Logs Insights (§3.9, D13);
  - **nuove scelte** D10 (motore predefinito), D11 (libreria), D12 (masking e ripristino dei token), D13 (letture
    troncate).
  - Le §1.1–§3.7 sono quelle della v02; la §3.6 vale per il motore `cloudwatch`.

## 1. Perché

### 1.1 Le query di oggi

Ogni voce del file di configurazione porta la query intera e il log group. Nei 6 file k8s di `configs/` le query sono
6, ma i tipi sono 2 e l'unica parte che cambia da un allarme all'altro è il nome del pod:

| File                       | Allarme                                                                | Tipo     | `pod_app` nella query                                 | `pattern` su |
| -------------------------- | ---------------------------------------------------------------------- | -------- | ----------------------------------------------------- | ------------ |
| `astro-fe.json`            | `k8s-interop-public-catalog-astro-frontend-errors-prod-public-catalog` | frontend | `interop-public-catalog-astro-frontend`               | `log`        |
| `catalog-process.json`     | `k8s-interop-be-catalog-process-errors-prod`                           | backend  | `interop-be-catalog-process`                          | `log`        |
| `config.json`              | `k8s-interop-be-m2m-gateway-v3-errors-prod`                            | backend  | `interop-be-m2m-gateway-v3`                           | `log`        |
| `diff.json`                | `k8s-interop-be-check-selfcare-diff-errors-prod`                       | backend  | `interop-be-check-selfcare-diff`                      | `log`        |
| `notification-config.json` | `k8s-interop-be-notification-config-readmodel-writer-sql-errors-prod`  | backend  | `interop-be-notification-config-readmodel-writer-sql` | `msg`        |
| `tenant-process.json`      | `k8s-interop-be-tenant-process-errors-prod`                            | backend  | `interop-be-tenant-process`                           | `log`        |

Il log group è lo stesso per tutti: `/aws/eks/interop-eks-cluster-prod/application`. Un settimo file,
`interopApiConfig.json`, analizza un allarme API Gateway (`interop-selfcare-1.0-prod-apigw-5xx`) con una query a mano
che costruisce il campo con `concat` (§1.4).

**Backend**: esclude `adot-collector`; tiene `ERROR`, `stderr` e le risposte 5xx; filtra sul pod; separa `log` in
`timestamp`, `level`, blocchi `[...]`, `cid` e `msg`; ordina; applica `pattern`.

**Frontend**: esclude `adot-collector`; tiene solo `ERROR`; filtra sul pod; esclude i record senza il campo `log`
(`@message not like '{"pod_app'`); applica `pattern log`.

### 1.2 Problemi che emergono dal confronto

1. **Il pod è scritto a mano** ed è sempre ricavabile dal nome dell'allarme: `k8s-<pod_app>-errors-<ambiente>`, con
   un suffisso facoltativo dopo l'ambiente (`-public-catalog` per astro). Le espressioni della §3.2 ricavano il pod
   giusto da tutti e 7 i nomi noti (i 6 file più `k8s-interop-be-authorization-server-node-errors-prod` della query di
   Gaspare).
2. **`pod_app like "<pod>"` confronta una sottostringa** e può prendere un altro pod con lo stesso inizio del nome.
   La query di Gaspare usa l'uguaglianza, che è il confronto corretto.
3. **`pattern log` lavora sulla riga grezza**: le parti ricavate con `parse` non vengono usate (§3.7).
4. **`sort timestamp asc` prima di `pattern` non ha effetto**: `pattern` raggruppa le righe, l'ordine non conta.

### 1.3 La query di Gaspare

Aggiunge due esclusioni utili: i record senza campo `log` (`@message not like '{"pod_app'`) e le righe degli stack
trace (`log not like '    at '`). Il testo incollato da Slack ha perso asterischi e backslash: l'espressione dei
blocchi va letta come quella già presente nei file di configurazione. Il commento `#` sulla riga del filtro toglie i
5xx, la riga `Extract pod_app from alarm name` è senza `#`, `SOURCE … START= END=` serve solo nella console, `dedup msg`
falserebbe i rapporti di `pattern`.

### 1.4 La risoluzione dei token non funziona (esecuzione del 25 novembre)

`interopApiConfig.json`, con `resolveStaticTokens: true`, ha prodotto `<*> - <*> - <*>` per entrambe le occorrenze.
La query senza `pattern` restituisce righe `<ip> - 504 - <percorso>`, quindi il risultato atteso era `<*> - 504 - <*>`.
Nel log non c'è nessuna riga «Pattern risolto».

La causa è la query di risoluzione che lo script genera oggi:

```
parse @message "* - * - *" as t0, t1, t2 | filter ispresent(t0) | stats count_distinct(t0) as cd0, earliest(t0) as v0, …
```

- Cerca il testo in `@message`, cioè nel JSON grezzo dell'access log, mentre il pattern è nato dal campo `msg`
  costruito con `concat`. Il glob non trova nulla e nessun token viene confermato.
- Gira sull'intero log group, senza `filter apigwId = …` né il filtro sui 5xx. Anche con il campo giusto conterebbe gli
  stati di tutte le API.

Per gli allarmi k8s vale lo stesso: il pattern nasce da `log` o `msg`, la risoluzione cerca in `@message` e su tutti i
pod.

Il campo può essere costruito in molti modi: `concat` di un numero qualunque di campi, `parse`, `log` grezzo,
`@message`, con un nome qualunque. La risoluzione non deve dipendere da come è costruito.

### 1.5 Quante letture costa un'analisi

Per un allarme con $J$ occorrenze, lo script esegue oggi:

- $J$ query con `pattern`, una per finestra;
- con `resolveStaticTokens: true`, una query di risoluzione per ogni pattern $P_k$ con almeno un `<*>` e per ogni
  finestra in cui $P_k$ è comparso: $\sum_k J_k$ query in più, con $J_k \le J$.

Logs Insights si paga a byte analizzati, e i byte analizzati dipendono dal log group e dalla finestra, non dai filtri
della query (salvo gli indici di campo). Ogni query di risoluzione rilegge quindi per intero una finestra che la query
del pattern ha già letto. Con 10 occorrenze e 6 pattern con token, ciascuno presente in media in 5 finestre, le
letture sono $10 + 6 \times 5 = 40$: quattro volte i byte della sola query dei pattern, per ricavare informazioni che
erano già nelle righe lette la prima volta.

A questo si aggiunge che `pattern` generalizza i token per forma (numeri, codici, percorsi), anche quando nella finestra
hanno un solo valore: è il motivo per cui esiste la risoluzione. Se i pattern si calcolano in locale sulle righe
scaricate, la risoluzione non costa più nessuna query.

## 2. Che cosa vede chi usa lo script

Per un allarme di un tipo noto, la voce di configurazione si riduce a questo:

```json
{
  "alarmName": "k8s-interop-be-catalog-process-errors-prod",
  "alarmHistoryStartDate": "2026-11-21T00:00:00.000Z",
  "alarmHistoryEndDate": "2026-11-23T17:00:00.000Z",
  "timeWindowExtraSeconds": 90
}
```

Lo script sceglie il modello dal nome dell'allarme, ricava pod, ambiente e log group, compone la query e scrive nel
log il modello scelto, le variabili e il log group:

```
Modello di query: interop-k8s-backend (podApp=interop-be-catalog-process, env=prod)
Log Group: /aws/eks/interop-eks-cluster-prod/application
```

Per un caso che nessun modello copre si scrive la query nella voce, in forma strutturata (§3.3):

```json
{
  "alarmName": "interop-selfcare-1.0-prod-apigw-5xx",
  "logGroup": "amazon-apigateway-interop-access-logs-prod",
  "alarmHistoryStartDate": "2026-11-23T17:00:00Z",
  "alarmHistoryEndDate": "2026-11-24T17:00:59Z",
  "query": {
    "lines": [
      "filter apigwId = \"tf9isbi4pi\"",
      "filter status like /5./",
      "fields concat(sourceIp, \" - \", status, \" - \", requestPath) as msg"
    ],
    "patternField": "msg"
  },
  "resolveStaticTokens": true
}
```

Con il motore `drain` (D10) il log dice quante query sono partite e quanti byte hanno letto:

```
Motore dei pattern: drain (simTh=0.4, depth=4)
[1/2] Lettura righe per allarme delle 2026-11-24T07:01:03.000Z (finestra: … -> …)...
  -> 1.284 righe (41,2 MB analizzati)
[2/2] Lettura righe per allarme delle 2026-11-24T09:12:33.000Z (finestra: … -> …)...
  -> 2.019 righe (44,7 MB analizzati)
Pattern estratti con Drain: 3 su 3.303 righe
  Pattern risolto: "<*> - <*> - /api/v1/payments/<*>" → "<*> - 504 - /api/v1/payments/<*>"
Query eseguite: 2 · byte analizzati: 85,9 MB
```

I tre report restano gli stessi, con gli stessi campi.

| Esigenza                                          | Come                                                           |
| ------------------------------------------------- | -------------------------------------------------------------- |
| Forzare un modello diverso da quello riconosciuto | `"queryTemplate": "interop-k8s-frontend"`                      |
| Cambiare o aggiungere una variabile               | `"queryVariables": { "podApp": "interop-be-catalog-process" }` |
| Cambiare log group                                | `"logGroup": "…"` (vince sul modello)                          |
| Scrivere la query a mano                          | `"query": { "lines": [ … ], "patternField": "…" }`             |
| Scegliere il motore dei pattern                   | `"patternEngine": "drain"` oppure `"cloudwatch"` (D10)         |

Un tipo di allarme nuovo si aggiunge con un modello nel codice (D1).

## 3. La proposta

### 3.1 Una sola forma di query

```ts
export interface PatternQuery {
  readonly lines: ReadonlyArray<string>;
  readonly patternField: string;
}
```

- `lines` sono i comandi che vengono prima di `pattern`, uno per riga e senza il `|` iniziale. Se il `|` c'è, viene
  tolto, così le righe si possono copiare dalla console.
- `patternField` è il campo su cui si calcolano i pattern. Può essere `@message`, `log`, un campo di `parse`, un campo
  di `fields … as …` o un nome tra backtick.
- Il comando finale lo aggiunge lo script: `| pattern <patternField>` con il motore `cloudwatch`, la lettura delle
  righe della §3.8 con il motore `drain`. Una riga che sia essa stessa un comando `pattern` è un errore.

I modelli nel codice e le query a mano hanno questa stessa forma. Ne seguono due conseguenze:

- query principale, query di risoluzione e query di lettura nascono dalle stesse righe, quindi non possono divergere;
- lo script non deve mai interpretare il testo di una query.

### 3.2 I modelli nel codice

```ts
export interface QueryTemplate {
  readonly id: string;
  readonly description: string;
  readonly alarmNamePattern?: RegExp;
  readonly logGroup: string;
  readonly query: PatternQuery;
}
```

Il catalogo è un array costante in `src/libs/query-templates.ts`. Le espressioni sono `RegExp` compilate una volta
sola. L'ordine conta: vince il primo modello il cui `alarmNamePattern` riconosce il nome, quindi i modelli più
specifici vanno prima. Un modello senza `alarmNamePattern` si usa solo se lo si sceglie con `queryTemplate`.

Catalogo iniziale (il backend dipende da D4, §3.7):

```ts
{
  id: 'interop-k8s-frontend',
  description: 'Allarmi k8s di Interop sui pod frontend',
  alarmNamePattern: /^k8s-(?<podApp>interop-[a-z0-9-]+-frontend)-errors-(?<env>[a-z]+)(?:-[a-z0-9-]+)?$/,
  logGroup: '/aws/eks/interop-eks-cluster-{{env}}/application',
  query: {
    lines: [
      'filter @logStream not like /adot-collector/',
      'filter @message like /ERROR/',
      `filter @message not like '{"pod_app'`,
      'filter pod_app = "{{podApp}}"',
    ],
    patternField: 'log',
  },
},
{
  id: 'interop-k8s-backend',
  description: 'Allarmi k8s di Interop sui pod backend',
  alarmNamePattern: /^k8s-(?<podApp>interop-be-[a-z0-9-]+?)-errors-(?<env>[a-z]+)$/,
  logGroup: '/aws/eks/interop-eks-cluster-{{env}}/application',
  query: {
    lines: [
      'filter @logStream not like /adot-collector/',
      'filter @message like /ERROR/ or stream = "stderr" or @message like /(?i)response 5\\d{2}/',
      `filter @message not like '{"pod_app'`,
      "filter log not like '    at '",
      'filter pod_app = "{{podApp}}"',
      // righe di parse e campo: §3.7 (D4)
    ],
    patternField: '…',
  },
},
{
  id: 'interop-apigw-5xx',            // D9
  description: 'Allarmi 5xx di API Gateway di Interop',
  alarmNamePattern: /^interop-(?<apiName>[a-z0-9.-]+?)-(?<env>[a-z]+)-apigw-5xx$/,
  logGroup: 'amazon-apigateway-interop-access-logs-{{env}}',
  query: {
    lines: [
      'filter apigwId = "{{apigwId}}"',
      'filter status like /^5\\d\\d$/',
      'fields concat(sourceIp, " - ", status, " - ", requestPath) as msg',
    ],
    patternField: 'msg',
  },
},
```

Nel modello API Gateway `apigwId` non si ricava dal nome: va dato con `queryVariables.apigwId`. Se manca, lo script si
ferma prima di interrogare AWS (§3.4). Il filtro sui 5xx usa `/^5\d\d$/` invece di `/5./`, che vale per qualunque
stato con un 5 seguito da un altro carattere.

### 3.3 La query a mano (D8)

`queryAwsCloudWatch` (stringa) è sostituita da `query` (un `PatternQuery`, §2). La possibilità di scrivere una query a
mano resta; cambia la forma. Con `query` è obbligatorio `logGroup`. Le righe passano per la stessa sostituzione delle
variabili dei modelli, quindi `{{alarmName}}` e `queryVariables` valgono anche qui.

### 3.4 Variabili e pod (D2)

Variabili, in ordine di precedenza crescente:

1. `alarmName`;
2. i gruppi con nome di `alarmNamePattern`;
3. `queryVariables` della voce.

Ogni `{{nome}}` in `logGroup` e nelle righe viene sostituito. Se un segnaposto resta senza valore, lo script si ferma
prima di interrogare AWS, indicando allarme, modello e nome mancante. I valori devono rispettare `^[A-Za-z0-9._/-]+$`,
perché un valore con virgolette o `|` romperebbe la query o ne cambierebbe il senso.

Per il pod, in concreto:

- **lo ricava il gruppo `podApp` del modello**, nel codice e non nella query. Si prova con i test senza AWS, un nome
  che non torna dà un errore immediato, e vale per ogni ambiente, mentre l'espressione di Gaspare vale solo per `prod`;
- **il confronto è esatto**, `filter pod_app = "{{podApp}}"`;
- **il valore finisce nel log** e si corregge con `queryVariables.podApp`;
- **c'è un avviso per il caso silenzioso**: se tutte le occorrenze di un allarme danno zero pattern, lo script scrive
  «nessuna riga per l'allarme X con le variabili …: controlla il nome o imposta `queryVariables`». Non costa query in
  più e copre un pod ricavato male. Vale per ogni modello e per entrambi i motori.

Una query preliminare che verifichi l'esistenza del pod è scartata: costerebbe una query per allarme per un caso che
l'avviso copre già.

### 3.5 Scelta della query per una voce

1. `query` presente: si usa quella, con `logGroup` obbligatorio.
2. `queryTemplate` presente: si usa quel modello. Se ha `alarmNamePattern` e il nome lo rispetta, i gruppi diventano
   variabili; altrimenti le variabili vanno date con `queryVariables`.
3. Altrimenti: il primo modello il cui `alarmNamePattern` riconosce il nome.
4. Nessun modello: errore (D7), con l'elenco dei modelli e il richiamo a `queryTemplate` e `query`.

`queryTemplate` con un id sconosciuto è un errore. Un test controlla che gli id del catalogo siano unici.

### 3.6 Risoluzione dei token con il motore `cloudwatch` (D5)

La query di risoluzione riparte dalle righe della query e lavora sul suo campo, qualunque sia la query: modello o
query a mano.

Il pattern diventa una **regex con le estremità fissate** al posto del glob. Le parti fisse passano per l'escape, ogni
`<*>` diventa un gruppo `(?<tN>.*?)`. Il glob aveva tre problemi:

- un `*` nel testo del pattern diventava un jolly in più;
- un testo con entrambi i tipi di virgolette rompeva la query;
- non è certo che il glob debba corrispondere all'intero campo e non solo a una parte.

```ts
export function buildPatternResolutionQuery(
  pattern: string,
  source: PatternQuery,
): { query: string; tokenCount: number } | null {
  const literals = pattern.split('<*>').map((part) => part.replace(/[\\^$.|?*+()[\]{}/]/g, '\\$&'));
  const tokenCount = literals.length - 1;
  if (tokenCount === 0) {
    return null;
  }
  const regex = literals.slice(1).reduce((acc, literal, i) => `${acc}(?<t${i}>.*?)${literal}`, literals[0] ?? '');
  const stats = Array.from(
    { length: tokenCount },
    (_, i) => `count_distinct(t${i}) as cd${i}, earliest(t${i}) as v${i}`,
  );
  const commands = [
    ...source.lines,
    `parse ${source.patternField} /^${regex}$/`,
    'filter ispresent(t0)',
    `stats ${stats.join(', ')}`,
  ];
  return { query: commands.join('\n| '), tokenCount };
}
```

Per il caso della §1.4:

```
filter apigwId = "tf9isbi4pi"
| filter status like /5./
| fields concat(sourceIp, " - ", status, " - ", requestPath) as msg
| parse msg /^(?<t0>.*?) - (?<t1>.*?) - (?<t2>.*?)$/
| filter ispresent(t0)
| stats count_distinct(t0) as cd0, earliest(t0) as v0, count_distinct(t1) as cd1, earliest(t1) as v1, count_distinct(t2) as cd2, earliest(t2) as v2
```

Il confronto tra le finestre resta com'è: un token viene sostituito solo se in ogni finestra ha un solo valore, e quel
valore è lo stesso in tutte.

**Limite**: se un valore contiene il separatore che compare nel pattern, per esempio un percorso con `" - "`, la regex
può assegnarne una parte al token sbagliato. Nel caso peggiore il token risulta variabile e resta `<*>`. Per evitarlo
basta un separatore che nei valori non compare.

`resolvePatternTokens` riceve in più il `PatternQuery`. Il vecchio `console.warn` diventa un avviso del logger dello
script.

### 3.7 Il campo di `pattern` per il backend (D4, aperta)

`parse log "* * *" as timestamp, level, tmpMsg` non controlla il formato della riga: gli bastano due spazi. Una riga
di `stderr` come `TypeError: Cannot read properties of undefined` diventa `timestamp` = `TypeError:`, `level` =
`Cannot`, `msg` = `read properties of undefined`. Il messaggio perde le prime due parole. Le righe con meno di due spazi
restano senza `msg`.

Proposta:

```
parse log /^(?<timestamp>…)\s+(?<level>…)\s+(?<tmpMsg>.*)$/
parse tmpMsg /(?<blocks>^(\s*-*\s*\[[^\]]+\])*)(?<msg>.*$)/
parse blocks "CID=*]" as cid
fields coalesce(msg, log) as patternText
```

con `patternField: 'patternText'`. Le righe nel formato standard danno il messaggio pulito; le altre, cioè stack trace
e `stderr`, danno la riga intera. Le parti `…` si scrivono su **una riga di log reale** di un backend (data, livello,
CID), che manca ancora. Con il motore `drain` la scelta pesa di più: Drain divide la riga sugli spazi, e un campo con
data e livello in testa a ogni riga allunga i token senza aggiungere informazione (§3.10).

### 3.8 Due motori, la stessa query (D10)

```ts
export type PatternEngine = 'cloudwatch' | 'drain';
```

La voce sceglie il motore con `patternEngine`. Entrambi partono dal `PatternQuery` della §3.5, con le stesse finestre
di oggi:

- **`cloudwatch`**: come nella v02. Una query `<lines> | pattern <patternField>` per occorrenza e, con
  `resolveStaticTokens`, le query di risoluzione della §3.6.
- **`drain`**: una sola query per occorrenza, che legge le righe del campo senza raggrupparle. Pattern e risoluzione
  si calcolano in locale e non costano altre query.

La query di lettura aggiunge alle righe quattro comandi, sempre gli stessi:

```
<lines>
| fields <patternField> as goPatternText
| filter ispresent(goPatternText)
| display @timestamp, goPatternText
| limit 10000
```

Per il caso della §1.4:

```
filter apigwId = "tf9isbi4pi"
| filter status like /^5\d\d$/
| fields concat(sourceIp, " - ", status, " - ", requestPath) as msg
| fields msg as goPatternText
| filter ispresent(goPatternText)
| display @timestamp, goPatternText
| limit 10000
```

- Il nome fisso `goPatternText` evita di dover sapere come si chiama il campo nelle righe del risultato; il prefisso
  evita collisioni con i campi della query.
- `display` restituisce solo i due campi che servono: meno byte da scaricare, nessun effetto sui byte analizzati.
- Nessun `sort`: l'ordine si fissa in locale (§3.10).

La lettura usa `queryWithStatistics` di `AWSCloudWatchLogsService`, che già restituisce `bytesScanned` e
`recordsMatched`. Lo script somma le statistiche e scrive nel log il numero di query e i byte analizzati (§2), per
entrambi i motori: è la misura con cui si verifica il risparmio (§4.7).

### 3.9 Più di 10.000 righe in una finestra (D13)

Logs Insights restituisce al più 10.000 righe per query (il massimo di `limit`). Con `pattern` il limite non si vede,
perché le righe restituite sono i pattern; con la lettura delle righe sì. Una finestra con più righe del limite
darebbe pattern e rapporti calcolati su un sottoinsieme arbitrario.

Lo script riconosce la lettura troncata quando `recordsMatched` supera le righe ricevute. Proposta, in ordine:

1. **Paginazione di go-aws** (`paginateResults`, già presente): se la verifica su AWS (§4.7) mostra che
   `GetQueryResults` restituisce pagine oltre le prime 10.000 righe, si usa questa. Non costa letture in più.
2. **Altrimenti, divisione della finestra**: la finestra si divide in $\lceil recordsMatched / 9000 \rceil$ parti
   uguali e ogni parte si rilegge; una parte ancora troncata si divide di nuovo. Ogni parte analizza solo i propri
   byte, quindi le parti insieme costano quanto la finestra intera. Il costo in più è la prima lettura troncata, più
   le eventuali nuove divisioni se le righe non sono distribuite in modo uniforme.

In entrambi i casi un tetto, `maxLinesPerOccurrence` con valore predefinito 100.000, ferma le letture: oltre il tetto
lo script scrive un avviso con l'occorrenza e le righe lette, e analizza quelle.

### 3.10 Pattern con Drain (D11)

Drain raggruppa le righe con un albero di prefissi: le righe vanno nello stesso gruppo se hanno lo stesso numero di
token e una quota sufficiente di token uguali (`simTh`); nel modello del gruppo i token che differiscono diventano
`<*>`. La libreria è `@agentix-e/drain-ts` (D11), con le impostazioni predefinite di Drain3: `depth` 4, `simTh` 0,4,
`maxChildren` 100, `parametrizeNumericTokens` attivo, segnaposto `<*>`.

**Un solo modello per allarme e per profilo**, addestrato sulle righe di tutte le occorrenze. Con un modello per
occorrenza lo stesso errore potrebbe uscire come `<*> - 504 - <*>` in un'occorrenza e `<*> - <*> - <*>` in un'altra, e
i tre report, che confrontano i pattern come testo, lo conterebbero due volte. Con un modello unico lo stesso errore ha
lo stesso testo in ogni occorrenza.

I passi:

1. **Ordine fisso.** Le righe di tutte le occorrenze si ordinano per `@timestamp` crescente e, a parità, per
   occorrenza e posizione. Drain dipende dall'ordine in cui riceve le righe: l'ordine fisso rende ripetibile il
   risultato.
2. **Addestramento.** Ogni riga passa per `TemplateMiner.addLogMessage`; lo script tiene per ogni riga l'occorrenza e
   il `clusterId` restituito.
3. **Pattern finali.** Finito l'addestramento, il pattern di una riga è il modello finale del suo gruppo. Drain
   generalizza soltanto, mai il contrario: il modello finale descrive ancora tutte le righe che ha raccolto.
4. **Risultati per occorrenza.** Per ogni occorrenza $j$ e gruppo $k$: `sampleCount` = righe di $k$ in $j$; `ratio` =
   `sampleCount` / righe lette in $j$, come `@ratio` di `pattern`. Il risultato è un `OccurrenceQueryResult` con la
   forma di oggi: pattern dominante, pareggi, copertura e i tre report non cambiano.

Restano fuori:

- **`extraDelimiters`**: Drain sostituisce i delimitatori in più con spazi, e il modello non corrisponderebbe più al
  testo originale (§3.11).
- **Le varianti di drain-ts che Drain3 non ha** (`JaccardDrain`, fusione dei gruppi, opzioni AEL): restano spente.
- **Il salvataggio del modello** tra un'esecuzione e l'altra: ogni esecuzione è indipendente e il modello è piccolo.

Drain lavora bene su testo diviso da spazi. Su una riga JSON i token sono pezzi di JSON e i pattern escono poveri: il
campo giusto è un testo, per i backend il `patternText` della §3.7.

Costo in locale: un passaggio sulle righe per l'addestramento e uno per la risoluzione (§3.13), con le righe di un
allarme in memoria, al più $J \times$ `maxLinesPerOccurrence`.

### 3.11 Dal pattern alla regex

Una funzione pura, `buildTemplateRegex(template)`, trasforma il modello di Drain in una regex con le estremità fissate,
compilata una volta per pattern:

- il modello si divide sugli spazi, come fa Drain con le righe;
- un token che è tutto `<*>` diventa `(\S+)`;
- un `<*>` dentro un token, che nasce dal masking (§3.12), diventa `(\S+?)`; per esempio `/api/v1/payments/<*>`
  diventa `\/api\/v1\/payments\/(\S+?)`;
- il resto passa per l'escape;
- i token si uniscono con `\s+`, e la regex è `^\s*…\s*$`.

La regex fa in locale il lavoro di `parse … | filter ispresent(t0)` della query di risoluzione: filtra, perché una
riga che non corrisponde non conta, ed estrae i valori dei token.

A differenza della §3.6, qui l'ambiguità del separatore non c'è. Un token di Drain non contiene spazi e le maschere non
possono riconoscere spazi (§3.12): ogni gruppo cattura esattamente il valore della sua posizione.

Per il caso della §1.4, con il masking della §3.12:

```
modello:  <*> - <*> - /api/v1/payments/<*>
regex:    ^\s*(\S+)\s+-\s+(\S+)\s+-\s+\/api\/v1\/payments\/(\S+?)\s*$
riga:     10.0.0.1 - 504 - /api/v1/payments/12   →   10.0.0.1, 504, 12
```

### 3.12 Masking (D12)

Senza masking, un modello unico non produce mai un `<*>` con un solo valore: un token diventa `<*>` solo quando due
righe del gruppo differiscono in quella posizione. La verifica di stabilità non troverebbe niente da ripristinare. Ma
senza masking un gruppo con una sola riga, o con poche righe che condividono un id, tiene nel modello l'id della
richiesta, un UUID, un numero: in ogni occorrenza esce un «pattern» diverso, e copertura e pattern dominante si
frammentano.

Il masking risolve questo e riapre lo stesso problema di `pattern` su CloudWatch: un valore generalizzato per forma
anche se è costante. La verifica di stabilità della §3.13 lo ripristina, senza query.

Proposta:

- **maschere**, in quest'ordine: UUID, IPv4 con porta facoltativa, esadecimali di almeno 8 cifre, numeri delimitati da
  caratteri non alfanumerici (così `v1` resta `v1`). Si parte dalle maschere pronte di drain-ts (`UUID`, `IP`,
  `HOST_PORT`, `HEX`, `NUM`), escluso `PATH`: il percorso è un'informazione diagnostica;
- **tutte con nome `*`**, così nel modello compaiono come `<*>`, come i token che Drain generalizza: il formato dei
  report resta quello di oggi e la ricomposizione posizionale non cambia;
- **nessuna maschera riconosce spazi**: lo controlla un test sul catalogo;
- con `drain`, **`resolveStaticTokens` vale `true` se non è indicato**, perché la risoluzione non costa query; con
  `false` i token restano `<*>`;
- **un token si ripristina solo se il pattern ha almeno 2 righe in tutto**. Una sola riga non prova nessuna stabilità:
  senza questa soglia il masking verrebbe annullato proprio sui gruppi da una riga. Con `cloudwatch` la regola resta
  quella di oggi.

### 3.13 Stabilità locale e globale dei token

Lo stesso criterio della §3.6, sulle righe invece che con `count_distinct` ed `earliest`:

- **locale** (occorrenza $j$): il token $i$ del pattern $k$ è stabile in $j$ se tutte le righe di $k$ in $j$
  corrispondono alla regex e danno lo stesso valore in quella posizione;
- **globale**: il token si ripristina se è stabile in ogni occorrenza in cui $k$ compare, con lo stesso valore in
  tutte, e se $k$ ha almeno 2 righe (§3.12).

Non serve il valore della prima riga in ordine di tempo: se il token è stabile, i valori sono tutti uguali. Per ogni
token basta ricordare il primo valore visto e se ne è comparso un altro.

```ts
export function findStableTokens(
  regex: RegExp,
  tokenCount: number,
  linesByOccurrence: ReadonlyArray<ReadonlyArray<string>>,
): ReadonlyMap<number, string> {
  const candidates = new Map<number, string>();
  const discarded = new Set<number>();
  for (const lines of linesByOccurrence) {
    const local = new Map<number, string>();
    for (const line of lines) {
      const groups = regex.exec(line);
      for (let i = 0; i < tokenCount; i++) {
        const value = groups?.[i + 1];
        const seen = local.get(i);
        if (value === undefined || (seen !== undefined && seen !== value)) {
          discarded.add(i);
        } else if (seen === undefined) {
          local.set(i, value);
        }
      }
    }
    for (const [i, value] of local) {
      const previous = candidates.get(i);
      if (previous === undefined) {
        candidates.set(i, value);
      } else if (previous !== value) {
        discarded.add(i);
      }
    }
  }
  return new Map([...candidates].filter(([i]) => !discarded.has(i)));
}
```

`linesByOccurrence` contiene solo le occorrenze in cui il pattern compare. Il costo è un passaggio sulle righe,
$O(L \times M)$ con $L$ righe e $M$ token, con memoria costante per token. La ricomposizione del pattern è quella di
oggi, per posizione sul `<*>`: diventa una funzione condivisa dai due motori.

Esempio, con due occorrenze dell'allarme API Gateway:

| Occorrenza | Righe del pattern `<*> - <*> - /api/v1/payments/<*>`            | t0         | t1        | t2        |
| ---------- | --------------------------------------------------------------- | ---------- | --------- | --------- |
| 1          | `10.0.0.1 - 504 - /api/v1/payments/12`, `10.0.0.7 - 504 - …/98` | variabile  | `504`     | variabile |
| 2          | `10.0.0.9 - 504 - /api/v1/payments/31`                          | `10.0.0.9` | `504`     | `31`      |
| Esito      |                                                                 | `<*>`      | **`504`** | `<*>`     |

t0 e t2 sono stabili nell'occorrenza 2 ma non nella 1: restano `<*>`. Il pattern diventa
`<*> - 504 - /api/v1/payments/<*>`.

### 3.14 Query e byte a confronto

Con $J$ occorrenze e $B_j$ i byte della finestra $j$:

| Motore                                 | Query                           | Byte analizzati                          | Righe scaricate                               |
| -------------------------------------- | ------------------------------- | ---------------------------------------- | --------------------------------------------- |
| `cloudwatch`                           | $J$                             | $\sum_j B_j$                             | i pattern                                     |
| `cloudwatch` con `resolveStaticTokens` | $J + \sum_k J_k$                | $\sum_j B_j + \sum_k \sum_{j \in k} B_j$ | i pattern e una riga di statistiche per query |
| `drain` (risoluzione compresa)         | $J$ (più le letture della §3.9) | $\sum_j B_j$ (più le letture troncate)   | tutte le righe del campo                      |

Senza risoluzione, `drain` costa in byte quanto `cloudwatch`: il risparmio sta nella risoluzione, che diventa
gratuita, e nel fatto che si può tenere sempre accesa. Le righe scaricate in più non si pagano come byte analizzati,
ma allungano i tempi e occupano memoria: per questo il tetto della §3.9.

### 3.15 Codice

| File                           | Contenuto                                                                                                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/types/PatternQuery.ts`    | Righe e campo di una query.                                                                                                                                                              |
| `src/types/QueryTemplate.ts`   | Un modello.                                                                                                                                                                              |
| `src/types/AlarmQuery.ts`      | La query pronta per una voce: `logGroup`, `PatternQuery` con le variabili sostituite, id del modello se c'è, variabili.                                                                  |
| `src/types/PatternEngine.ts`   | `'cloudwatch' \| 'drain'`.                                                                                                                                                               |
| `src/libs/query-templates.ts`  | Il catalogo; scelta del modello; sostituzione e controllo delle variabili; controllo di righe e campo; composizione della query di `pattern` e di quella di lettura. Funzioni pure.      |
| `src/libs/pattern-analyzer.ts` | `buildPatternResolutionQuery` e `resolvePatternTokens` con il `PatternQuery` (§3.6); la ricomposizione posizionale come funzione esportata.                                              |
| `src/libs/log-reader.ts`       | Lettura delle righe di un'occorrenza con `queryWithStatistics`, riconoscimento della lettura troncata, paginazione o divisione della finestra, tetto delle righe (§3.9).                 |
| `src/libs/drain-patterns.ts`   | Configurazione di Drain e maschere; addestramento; risultati per occorrenza; `buildTemplateRegex`; `findStableTokens` (§3.10–§3.13). È l'unico file che importa drain-ts.                |
| `src/libs/alarm-analysis.ts`   | Sceglie il motore; risolve la `AlarmQuery`; scrive modello, variabili, motore, query eseguite e byte analizzati; avvisa se non arriva nessun pattern.                                    |
| `src/types/PatternTypes.ts`    | `logGroup` facoltativo; `queryAwsCloudWatch` sostituito da `query`; nuovi `queryTemplate`, `queryVariables`, `patternEngine`, `maxLinesPerOccurrence`.                                   |
| `package.json`                 | `@agentix-e/drain-ts` dal catalogo del workspace (D11).                                                                                                                                  |
| `pnpm-workspace.yaml`          | La voce di catalogo, con la versione esatta.                                                                                                                                             |
| `configs/*.json`               | I 6 file k8s senza query né log group (D6); `interopApiConfig.json` con `query` strutturata e `queryVariables.apigwId` se D9 è approvata; `config.example.json` con un esempio per caso. |
| `README.md`                    | Modelli, scelta, variabili, query a mano, i due motori, esempi.                                                                                                                          |
| `STATIC_TOKEN_RESOLUTION.md`   | Oggi descrive la risoluzione con glob e pipeline ricavata dal testo della query: si riscrive sulla §3.6 e si aggiunge la risoluzione in locale (§3.11–§3.13).                            |

`main.ts` e `index.ts` non cambiano.

## 4. Test e verifica

### 4.1 `query-templates.test.ts`

- I 7 nomi k8s noti scelgono il modello giusto e ricavano `podApp` ed `env`. `interop-selfcare-1.0-prod-apigw-5xx`
  sceglie `interop-apigw-5xx` con `apiName` = `selfcare-1.0`. `pn-delivery-B2B-ApiGwAlarm` non ne sceglie nessuno.
- Precedenza: `query`, poi `queryTemplate`, poi `alarmNamePattern`. `queryVariables` vince sui gruppi.
- Errori: segnaposto senza valore (anche `apigwId` mancante), valore con caratteri non ammessi, `queryTemplate`
  sconosciuto, nessun modello, `query` senza `logGroup`, riga `pattern …`, campo non valido, id duplicati nel catalogo.
- Il `|` iniziale di una riga viene tolto; la query composta finisce con `| pattern <campo>`.
- La query di lettura finisce con i quattro comandi della §3.8, anche con un campo tra backtick.

### 4.2 `pattern-analyzer.test.ts`

- Risoluzione per k8s, API Gateway e `@message`: la query inizia con le righe e fa `parse` sul campo.
- Pattern con `*`, `/`, entrambi i tipi di virgolette e parentesi: la regex resta valida e i gruppi sono quanti i
  `<*>`.
- I test esistenti di `buildPatternResolutionQuery` si aggiornano alla nuova firma.

### 4.3 `drain-patterns.test.ts`

- **Ripetibilità**: le stesse righe in ordine diverso nelle occorrenze danno gli stessi pattern.
- **Modello unico**: un errore presente in due occorrenze ha lo stesso testo in entrambe; `sampleCount` e `ratio` sono
  giusti e i `ratio` di un'occorrenza sommano a 1.
- **Regex**: escape di `* . ( ) [ ] / | ? + $ ^ \`; spazi multipli e tabulazioni nella riga; `<*>` dentro un token;
  gruppi quanti i `<*>`; ogni riga di un gruppo corrisponde al modello finale del gruppo.
- **Stabilità**: `504` mascherato e costante in tutte le occorrenze torna `504`; resta `<*>` se cambia dentro
  un'occorrenza, se è stabile in ogni occorrenza ma con valori diversi (l'esempio della §3.13), se una riga non
  corrisponde, se il pattern ha una sola riga.
- **Maschere**: compaiono come `<*>`; nessuna riconosce uno spazio; `v1` non viene mascherato.
- **Riferimento**: un insieme di righe reali anonimizzate dell'allarme API Gateway, con i pattern attesi scritti nel
  test, protegge da un cambio di comportamento della libreria.

### 4.4 `log-reader.test.ts`

Con un servizio finto:

- lettura completa: una query, righe e statistiche passate oltre;
- lettura troncata: divisione in $\lceil recordsMatched / 9000 \rceil$ parti contigue, senza buchi né righe doppie ai
  confini; una parte ancora troncata si divide di nuovo;
- tetto superato: avviso e analisi delle righe lette.

### 4.5 Verifica su AWS (committente)

1. **Quantificatori non avidi.** La query della §3.6 nella console, sulla finestra 2026-11-24T07:00:03Z →
   07:03:03Z, conferma che Logs Insights accetta `.*?` e dà `cd1 = 1`, `v1 = 504`. Se `.*?` non è accettato, il gruppo
   diventa `[^<primo carattere della parte fissa seguente>]*`.
2. `interopApiConfig.json` con `resolveStaticTokens: true` deve dare `<*> - 504 - <*>` con `cloudwatch` e
   `<*> - 504 - …` con `drain`.
3. `config.json` e `notification-config.json` senza query: confronto dei pattern con le esecuzioni precedenti.
4. **Risparmio.** Lo stesso allarme con i due motori e `resolveStaticTokens: true`: il log deve mostrare $J$ query con
   `drain` contro $J + \sum_k J_k$ con `cloudwatch`, e byte analizzati pari a quelli delle sole query di `pattern`.
5. **Oltre 10.000 righe.** Su una finestra con più di 10.000 righe: se `paginateResults` restituisce tutte le righe
   (decide il punto 1 di D13); se i confini delle parti della §3.9 producono buchi o righe doppie.
6. **Confronto dei pattern.** Sugli allarmi del punto 3, i pattern di `drain` e di `cloudwatch` non saranno identici
   (Drain lavora per token interi, `pattern` anche dentro i token): si guarda che i pattern dominanti indichino gli
   stessi errori.

### 4.6 Gate

`pnpm --filter=go-report-error-patterns build`, `test`, `pnpm lint` sui file toccati, `pnpm check` per knip e
dependency-cruiser dopo l'aggiunta della dipendenza.

## 5. Fuori da questa specifica

- **Modelli per allarmi non Interop** (SEND `pn-*`, Lambda, ECS): si aggiungono al catalogo quando servono, con
  query provate su allarmi veri.
- **Interpretare il testo di una query** per ricavarne righe e campo: scartato con D8, perché `|` dentro regex e
  stringhe, i commenti `#` e i comandi dopo `pattern` lo renderebbero fragile.
- **Comandi dopo `pattern`** (`filter @ratio > …`, `sort`, `limit`): oggi non servono. Se serviranno, si aggiunge un
  campo `afterPattern` a `PatternQuery`.
- **Ricavare il pod dentro Logs Insights**, come nella query di Gaspare: scartato (§3.4).
- **`dedup`, `display`, `sort` prima di `pattern`**: falsano i rapporti o non servono.
- **Togliere il motore `cloudwatch`**: resta, per confronto e per i casi in cui le righe sono troppe da scaricare.
- **Leggere le righe con `FilterLogEvents`**: non conosce `fields`, `parse`, `concat` né i filtri di Logs Insights, e
  le righe del `PatternQuery` andrebbero riscritte con un'altra sintassi. Scartato.
- **Valori costanti solo dentro un'occorrenza**: il calcolo della §3.13 li conosce già (stabili in $j$ ma non
  ovunque) e potrebbero comparire nel report di quell'occorrenza. Cambia i report: rimandato.
- **Drain in `@pagopa/go-common`**: oggi c'è un solo script che lo usa. Se ne arriva un secondo, si sposta in
  `analysis`, con una decisione a parte sulla dipendenza, perché go-common è pubblicato.
- **Impostazioni di Drain nella voce** (`simTh`, `depth`, maschere): restano nel codice finché un allarme vero non
  chiede valori diversi.

## 6. Le scelte del committente

- **D1 · Dove sta il catalogo.** Nel codice TypeScript. _Risposta del 25 novembre 2026._
- **D2 · Come si ricava il pod.** Nel codice, con la proposta di Claude su come farlo (§3.4). _Risposta del 25 novembre 2026._
- **D3 · Condizione sui 5xx nel backend.** Resta. _Risposta del 25 novembre 2026._
- **D4 · Campo di `pattern` per il backend.** Aperta. Proposta: `coalesce(msg, log)` con un `parse` che accetta solo
  le righe nel formato standard (§3.7). Serve una riga di log reale. Alternative: `log` come oggi, oppure `msg` senza
  ripiego.
- **D5 · Risoluzione dei token con le righe della query.** Sì. _Risposta del 25 novembre 2026._ Estesa nella v02 alle
  query a mano (§3.6).
- **D6 · File di `configs/`.** Via query e log group dai file k8s. _Risposta del 25 novembre 2026._
- **D7 · Allarme senza modello e senza query.** Errore. _Risposta del 25 novembre 2026._
- **D8 · Forma della query a mano.** `query` strutturata al posto della stringa `queryAwsCloudWatch`. _Risposta del 25
  novembre 2026._
- **D9 · Modello API Gateway.** Aperta. Proposta: il modello `interop-apigw-5xx` della §3.2, con `apigwId` dato in
  `queryVariables` e il filtro `/^5\d\d$/`. Alternative: nessun modello, così l'allarme resta con la query a mano;
  oppure una tabella nel codice che associa ogni API al suo id.
- **D10 · Motore predefinito.** Aperta. Proposta: `drain` per le voci senza `patternEngine`, `cloudwatch` scelto voce
  per voce. Alternative: `cloudwatch` predefinito finché la verifica della §4.5 non è fatta; oppure un parametro
  dello script che vale per tutte le voci di un'esecuzione.
- **D11 · Libreria Drain.** Aperta. Proposta: `@agentix-e/drain-ts` 1.1.1, a versione esatta nel catalogo, usata solo
  da `drain-patterns.ts`. A favore: licenza MIT, nessuna dipendenza, ESM e CJS con i tipi, Node ≥ 22 compatibile con
  gli `engines` del repository, si dichiara porting 1:1 di Drain3 0.9.11 (non verificato). Contro: progetto giovane
  (prima pubblicazione 20 luglio 2026, ultima 31 luglio 2026, nessuna stella); per questo il test di riferimento della
  §4.3. Alternative: un'implementazione di Drain nello script (albero di prefissi, `simTh`, generalizzazione: qualche
  centinaio di righe da mantenere, nessuna dipendenza); oppure Drain3 in Python come processo esterno, scartata perché
  porta un secondo runtime.
- **D12 · Masking e ripristino dei token.** Aperta. Proposta: maschere UUID, IP con porta, esadecimali lunghi e numeri,
  tutte rese come `<*>`; `resolveStaticTokens` acceso per `drain` se non indicato; ripristino solo per pattern con
  almeno 2 righe (§3.12). Alternative: nessuna maschera, con la risoluzione che non ripristina quasi mai niente e i
  pattern frammentati dagli id; oppure maschere con il nome visibile (`<IP>`, `<NUM>`), più leggibili ma con un formato
  dei report diverso da quello di `cloudwatch`.
- **D13 · Letture troncate a 10.000 righe.** Aperta. Proposta: paginazione di go-aws se la verifica su AWS la
  conferma, altrimenti divisione della finestra; tetto di 100.000 righe per occorrenza con avviso (§3.9).
  Alternativa: solo un avviso, con pattern e rapporti calcolati sulle prime 10.000 righe.
