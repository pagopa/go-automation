# SPEC-011 · Query pronte per tipo di allarme in go-report-error-patterns — v02

- Stato: **bozza**, da approvare. Restano aperte D4 (serve una riga di log reale) e D9.
- Autore: Claude.
- Origine: richiesta del committente del 25 novembre 2026: rendere facoltativa la query nel file di configurazione e
  sceglierla in base al tipo di allarme, ricavando il `pod_app` dal nome per gli allarmi k8s. La query di riferimento
  è quella condivisa da Gaspare Perricone lo stesso giorno.
- Rispetto alla v01:
  - **D1**: catalogo nel codice;
  - **D8**: la query a mano diventa strutturata;
  - **risoluzione dei token**: riparte dalle righe della query per qualunque query, con una regex al posto del glob
    (§3.6), dopo il caso API Gateway del 25 novembre (§1.4);
  - **pod**: i dettagli di come ricavarlo (D2, §3.4);
  - **API Gateway**: proposta di un modello (D9).

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
   un suffisso facoltativo dopo l'ambiente (`-public-catalog` per astro). Le espressioni della §3.3 ricavano il pod
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

| Esigenza                                          | Come                                                           |
| ------------------------------------------------- | -------------------------------------------------------------- |
| Forzare un modello diverso da quello riconosciuto | `"queryTemplate": "interop-k8s-frontend"`                      |
| Cambiare o aggiungere una variabile               | `"queryVariables": { "podApp": "interop-be-catalog-process" }` |
| Cambiare log group                                | `"logGroup": "…"` (vince sul modello)                          |
| Scrivere la query a mano                          | `"query": { "lines": [ … ], "patternField": "…" }`             |

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
- `patternField` è il campo su cui lavora `pattern`. Può essere `@message`, `log`, un campo di `parse`, un campo di
  `fields … as …` o un nome tra backtick.
- `| pattern <patternField>` lo aggiunge lo script. Una riga che sia essa stessa un comando `pattern` è un errore.

I modelli nel codice e le query a mano hanno questa stessa forma. Ne seguono due conseguenze:

- query principale e query di risoluzione nascono dalle stesse righe, quindi non possono divergere;
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
  più e copre un pod ricavato male. Vale per ogni modello, non solo per k8s.

Una query preliminare che verifichi l'esistenza del pod è scartata: costerebbe una query per allarme per un caso che
l'avviso copre già.

### 3.5 Scelta della query per una voce

1. `query` presente: si usa quella, con `logGroup` obbligatorio.
2. `queryTemplate` presente: si usa quel modello. Se ha `alarmNamePattern` e il nome lo rispetta, i gruppi diventano
   variabili; altrimenti le variabili vanno date con `queryVariables`.
3. Altrimenti: il primo modello il cui `alarmNamePattern` riconosce il nome.
4. Nessun modello: errore (D7), con l'elenco dei modelli e il richiamo a `queryTemplate` e `query`.

`queryTemplate` con un id sconosciuto è un errore. Un test controlla che gli id del catalogo siano unici.

### 3.6 Risoluzione dei token (D5)

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
CID), che manca ancora.

### 3.8 Codice

| File                           | Contenuto                                                                                                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/types/PatternQuery.ts`    | Righe e campo di una query.                                                                                                                                                              |
| `src/types/QueryTemplate.ts`   | Un modello.                                                                                                                                                                              |
| `src/types/AlarmQuery.ts`      | La query pronta per una voce: `logGroup`, `PatternQuery` con le variabili sostituite, id del modello se c'è, variabili.                                                                  |
| `src/libs/query-templates.ts`  | Il catalogo; scelta del modello; sostituzione e controllo delle variabili; controllo di righe e campo; composizione della query di `pattern`. Funzioni pure.                             |
| `src/libs/pattern-analyzer.ts` | `buildPatternResolutionQuery` e `resolvePatternTokens` con il `PatternQuery` (§3.6).                                                                                                     |
| `src/libs/alarm-analysis.ts`   | Risolve la `AlarmQuery` di ogni voce, la passa a query e risoluzione, scrive modello e variabili nel log, avvisa se non arriva nessun pattern.                                           |
| `src/types/PatternTypes.ts`    | `logGroup` facoltativo; `queryAwsCloudWatch` sostituito da `query`; nuovi `queryTemplate` e `queryVariables`.                                                                            |
| `configs/*.json`               | I 6 file k8s senza query né log group (D6); `interopApiConfig.json` con `query` strutturata e `queryVariables.apigwId` se D9 è approvata; `config.example.json` con un esempio per caso. |
| `README.md`                    | Modelli, scelta, variabili, query a mano, esempi.                                                                                                                                        |

`main.ts` non cambia.

## 4. Test e verifica

### 4.1 `query-templates.test.ts`

- I 7 nomi k8s noti scelgono il modello giusto e ricavano `podApp` ed `env`. `interop-selfcare-1.0-prod-apigw-5xx`
  sceglie `interop-apigw-5xx` con `apiName` = `selfcare-1.0`. `pn-delivery-B2B-ApiGwAlarm` non ne sceglie nessuno.
- Precedenza: `query`, poi `queryTemplate`, poi `alarmNamePattern`. `queryVariables` vince sui gruppi.
- Errori: segnaposto senza valore (anche `apigwId` mancante), valore con caratteri non ammessi, `queryTemplate`
  sconosciuto, nessun modello, `query` senza `logGroup`, riga `pattern …`, campo non valido, id duplicati nel catalogo.
- Il `|` iniziale di una riga viene tolto; la query composta finisce con `| pattern <campo>`.

### 4.2 `pattern-analyzer.test.ts`

- Risoluzione per k8s, API Gateway e `@message`: la query inizia con le righe e fa `parse` sul campo.
- Pattern con `*`, `/`, entrambi i tipi di virgolette e parentesi: la regex resta valida e i gruppi sono quanti i
  `<*>`.
- I test esistenti di `buildPatternResolutionQuery` si aggiornano alla nuova firma.

### 4.3 Verifica su AWS (committente)

1. **Quantificatori non avidi.** La query della §3.6 nella console, sulla finestra 2026-11-24T07:00:03Z →
   07:03:03Z, conferma che Logs Insights accetta `.*?` e dà `cd1 = 1`, `v1 = 504`. Se `.*?` non è accettato, il gruppo
   diventa `[^<primo carattere della parte fissa seguente>]*`.
2. `interopApiConfig.json` con `resolveStaticTokens: true` deve dare `<*> - 504 - <*>`.
3. `config.json` e `notification-config.json` senza query: confronto dei pattern con le esecuzioni precedenti.

### 4.4 Gate

`pnpm --filter=go-report-error-patterns build`, `test`, `pnpm lint` sui file toccati.

## 5. Fuori da questa specifica

- **Modelli per allarmi non Interop** (SEND `pn-*`, Lambda, ECS): si aggiungono al catalogo quando servono, con
  query provate su allarmi veri.
- **Interpretare il testo di una query** per ricavarne righe e campo: scartato con D8, perché `|` dentro regex e
  stringhe, i commenti `#` e i comandi dopo `pattern` lo renderebbero fragile.
- **Comandi dopo `pattern`** (`filter @ratio > …`, `sort`, `limit`): oggi non servono. Se serviranno, si aggiunge un
  campo `afterPattern` a `PatternQuery`.
- **Ricavare il pod dentro Logs Insights**, come nella query di Gaspare: scartato (§3.4).
- **`dedup`, `display`, `sort` prima di `pattern`**: falsano i rapporti o non servono.

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
