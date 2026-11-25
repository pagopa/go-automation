# SPEC-011 · Query pronte per tipo di allarme in go-report-error-patterns — v01

- Stato: **bozza**, da approvare.
- Autore: Claude.
- Origine: richiesta del committente del 25 novembre 2026: rendere facoltativo `queryAwsCloudWatch` nel file di
  configurazione e scegliere la query in base al tipo di allarme, con l'estrazione del `pod_app` dal nome per gli
  allarmi k8s (query condivisa da Gaspare Perricone lo stesso giorno).

## 1. Perché

### 1.1 Le query di oggi

Ogni voce del file di configurazione porta la query intera e il log group. Nei 6 file reali di `configs/` le query
sono 6, ma i tipi sono 2 e l'unica parte che cambia da un allarme all'altro è il nome del pod:

| File                       | Allarme                                                                | Tipo     | `pod_app` nella query                                 | `pattern` su |
| -------------------------- | ---------------------------------------------------------------------- | -------- | ----------------------------------------------------- | ------------ |
| `astro-fe.json`            | `k8s-interop-public-catalog-astro-frontend-errors-prod-public-catalog` | frontend | `interop-public-catalog-astro-frontend`               | `log`        |
| `catalog-process.json`     | `k8s-interop-be-catalog-process-errors-prod`                           | backend  | `interop-be-catalog-process`                          | `log`        |
| `config.json`              | `k8s-interop-be-m2m-gateway-v3-errors-prod`                            | backend  | `interop-be-m2m-gateway-v3`                           | `log`        |
| `diff.json`                | `k8s-interop-be-check-selfcare-diff-errors-prod`                       | backend  | `interop-be-check-selfcare-diff`                      | `log`        |
| `notification-config.json` | `k8s-interop-be-notification-config-readmodel-writer-sql-errors-prod`  | backend  | `interop-be-notification-config-readmodel-writer-sql` | `msg`        |
| `tenant-process.json`      | `k8s-interop-be-tenant-process-errors-prod`                            | backend  | `interop-be-tenant-process`                           | `log`        |

Il log group è lo stesso per tutti: `/aws/eks/interop-eks-cluster-prod/application`.

**Backend** (5 file): esclude `adot-collector`; tiene `ERROR`, `stderr` e le risposte 5xx; filtra sul pod; separa
`log` in `timestamp`, `level`, blocchi `[...]`, `cid` e `msg`; ordina; applica `pattern`.

**Frontend** (`astro-fe.json`): esclude `adot-collector`; tiene solo `ERROR`; filtra sul pod; esclude i record senza
il campo `log` (`@message not like '{"pod_app'`); applica `pattern log`.

### 1.2 Problemi che emergono dal confronto

1. **Il pod è scritto a mano** ed è sempre ricavabile dal nome dell'allarme: `k8s-<pod_app>-errors-<ambiente>`, con
   un suffisso facoltativo dopo l'ambiente (`-public-catalog` per astro). Ho provato l'espressione della §3.3 sui 7
   nomi noti (i 6 file più `k8s-interop-be-authorization-server-node-errors-prod` della query di Gaspare): ricava il
   pod giusto in tutti i casi.
2. **`pod_app like "<pod>"` confronta una sottostringa**: `like "interop-be-catalog-process"` prende anche un pod
   che si chiama, per esempio, `interop-be-catalog-process-outbound-writer`. La query di Gaspare usa l'uguaglianza
   (`filter pod_app = pod`), che è il confronto corretto.
3. **`pattern log` lavora sulla riga grezza**: le parti ricavate con `parse` (`msg` senza timestamp, livello e CID)
   non vengono usate, tranne che in `notification-config.json`. Su `log`, timestamp e CID diventano `<*>` e il
   messaggio vero si legge peggio.
4. **`sort timestamp asc` prima di `pattern` non ha effetto**: `pattern` raggruppa le righe, l'ordine non conta.
5. **La risoluzione dei token statici non usa i filtri della query.** `buildPatternResolutionQuery` produce
   `parse @message "<glob>" as t0, … | filter ispresent(t0) | stats …` sull'intero log group: non filtra per pod e
   cerca il pattern in `@message`, cioè nel JSON del record k8s. Il pattern invece è stato calcolato su `log` o `msg`.
   Il risultato è che un token può sembrare variabile perché compaiono altri pod, oppure il glob non trova il testo
   perché in `@message` le virgolette sono codificate come in un JSON. È probabilmente il motivo per cui si risolvono
   pochi token. Va verificato su un'esecuzione reale (§4.3).

### 1.3 La query di Gaspare

Aggiunge due esclusioni utili: i record senza campo `log` (`@message not like '{"pod_app'`, già nella query del
frontend) e le righe degli stack trace (`log not like '    at '`).

Il testo incollato da Slack ha perso asterischi e backslash: `/(?<blocks>^(\s-\s[[^]]+]))(?<msg>.$)/` va letto come
l'espressione già presente nei file di configurazione, `/(?<blocks>^(\s*-*\s*\[[^\]]+\])*)(?<msg>.*$)/`. Inoltre:

- il commento `#` sulla riga del filtro toglie la condizione sulle risposte 5xx;
- `Extract pod_app from alarm name` è senza `#`, quindi così com'è la query non è valida;
- `filter pod_app like '<Insert pod_app here>'` è un residuo del modello;
- `SOURCE … START= END=` serve solo nella console: lo script passa log group e intervallo all'API;
- `dedup msg` toglierebbe le ripetizioni, falsando i rapporti di `pattern`; `display` e `sort` sono inutili prima
  di `pattern`.

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

Le query restano personalizzabili in tre modi, dal più leggero al più completo:

| Esigenza                                          | Come                                                           |
| ------------------------------------------------- | -------------------------------------------------------------- |
| Forzare un modello diverso da quello riconosciuto | `"queryTemplate": "interop-k8s-frontend"`                      |
| Cambiare una variabile (pod, ambiente, …)         | `"queryVariables": { "podApp": "interop-be-catalog-process" }` |
| Cambiare log group                                | `"logGroup": "…"` (vince sul modello)                          |
| Usare una query scritta a mano                    | `"queryAwsCloudWatch": "…"` con `"logGroup"`, come oggi        |

Un tipo di allarme nuovo si aggiunge scrivendo un modello nel catalogo, senza cambiare codice né ricompilare (§3.2).

## 3. La proposta

### 3.1 Il catalogo dei modelli

Un file JSON, `configs/query-templates.json`, con la stessa logica di ricerca del file di configurazione (GOPaths,
`GOPathType.CONFIG`): prima `data/go-report-error-patterns/configs/`, poi la cartella `configs/` dello script. Così
chi vuole modelli propri li mette in `data/` senza toccare quelli del repository. Un parametro facoltativo,
`--query-templates-file` (`-qtf`), ne cambia il nome; il valore predefinito è `query-templates.json`.

Ogni modello:

| Campo              | Obbligatorio | Significato                                                                                                                                                                          |
| ------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`               | Sì           | Nome del modello, unico nel catalogo.                                                                                                                                                |
| `description`      | Sì           | A che tipo di allarme serve.                                                                                                                                                         |
| `alarmNamePattern` | No           | Espressione regolare sul nome dell'allarme. I gruppi con nome (`(?<podApp>…)`) diventano variabili. Senza questo campo, il modello si usa solo se lo si sceglie con `queryTemplate`. |
| `logGroup`         | Sì           | Log group, con le variabili (`/aws/eks/interop-eks-cluster-{{env}}/application`).                                                                                                    |
| `query`            | Sì           | Righe della query **prima** di `pattern`: filtri e `parse`. Un array di stringhe, una per riga, per leggerle e confrontarle meglio.                                                  |
| `patternField`     | Sì           | Campo su cui lavora `pattern` (`log`, `msg`, `@message`).                                                                                                                            |

Lo script aggiunge da solo `| pattern <patternField>`, così ogni modello produce i campi che l'analisi si aspetta
(`@pattern`, `@ratio`, `@sampleCount`).

### 3.2 Il catalogo iniziale

Due modelli, ricavati dalle query della §1.1 con le correzioni della §1.2 e le esclusioni della §1.3. L'ordine conta:
vince il primo modello il cui `alarmNamePattern` riconosce il nome, e il frontend è più specifico del backend.

```json
{
  "templates": [
    {
      "id": "interop-k8s-frontend",
      "description": "Allarmi k8s di Interop sui pod frontend (log senza livello né CID)",
      "alarmNamePattern": "^k8s-(?<podApp>interop-[a-z0-9-]+-frontend)-errors-(?<env>[a-z]+)(?:-[a-z0-9-]+)?$",
      "logGroup": "/aws/eks/interop-eks-cluster-{{env}}/application",
      "query": [
        "filter @logStream not like /adot-collector/",
        "| filter @message like /ERROR/",
        "| filter @message not like '{\"pod_app'",
        "| filter pod_app = \"{{podApp}}\""
      ],
      "patternField": "log"
    },
    {
      "id": "interop-k8s-backend",
      "description": "Allarmi k8s di Interop sui pod backend (log con timestamp, livello e blocchi [CID=…])",
      "alarmNamePattern": "^k8s-(?<podApp>interop-be-[a-z0-9-]+?)-errors-(?<env>[a-z]+)$",
      "logGroup": "/aws/eks/interop-eks-cluster-{{env}}/application",
      "query": [
        "filter @logStream not like /adot-collector/",
        "| filter @message like /ERROR/ or stream = \"stderr\" or @message like /(?i)response 5\\d{2}/",
        "| filter @message not like '{\"pod_app'",
        "| filter log not like '    at '",
        "| filter pod_app = \"{{podApp}}\"",
        "| parse log \"* * *\" as timestamp, level, tmpMsg",
        "| parse tmpMsg /(?<blocks>^(\\s*-*\\s*\\[[^\\]]+\\])*)(?<msg>.*$)/",
        "| parse blocks \"CID=*]\" as cid"
      ],
      "patternField": "msg"
    }
  ]
}
```

Esempio di un tipo diverso, **solo per mostrare il meccanismo** (non entra nel catalogo, vedi §5): un allarme Lambda
`<funzione>-LogInvocationErrors-Alarm` diventerebbe

```json
{
  "id": "lambda-invocation-errors",
  "description": "Errori di invocazione di una Lambda",
  "alarmNamePattern": "^(?<functionName>[A-Za-z0-9-]+)-LogInvocationErrors-Alarm$",
  "logGroup": "/aws/lambda/{{functionName}}",
  "query": ["filter @message like /ERROR/"],
  "patternField": "@message"
}
```

### 3.3 Variabili e composizione

Variabili disponibili, in ordine di precedenza crescente:

1. `alarmName`, sempre presente;
2. i gruppi con nome di `alarmNamePattern`;
3. `queryVariables` della voce di configurazione.

Ogni `{{nome}}` in `logGroup` e in `query` viene sostituito. Se un segnaposto resta senza valore, lo script si ferma
prima di interrogare AWS, con l'allarme, il modello e il nome che manca. I valori sostituiti devono rispettare
`^[A-Za-z0-9._/-]+$`: un valore con virgolette o `|` romperebbe la query, o la cambierebbe, e viene rifiutato.

**Il pod si ricava nel codice, non nella query.** La query di Gaspare lo ricava dentro Logs Insights
(`fields '<allarme>' as k8sAlarmName | parse k8sAlarmName /…/ | filter pod_app = pod`). Propongo invece di estrarlo
in TypeScript, con il gruppo `podApp` del modello, e di scriverlo nella query come valore fisso. I motivi:

- si prova con i test senza AWS (i 7 nomi della §1.2);
- se il nome non torna, l'errore arriva subito e dice quale allarme;
- il valore finisce nel log e serve anche nel log group e nella query di risoluzione;
- l'espressione di Gaspare (`(?<=k8s-).*(?=-errors-prod)`) vale solo per `prod`.

### 3.4 Scelta della query per una voce

1. `queryAwsCloudWatch` presente: si usa così com'è, con `logGroup` obbligatorio. È il comportamento di oggi.
2. `queryTemplate` presente: si usa quel modello. Se ha `alarmNamePattern` e il nome lo rispetta, i gruppi diventano
   variabili; altrimenti le variabili vanno date con `queryVariables`.
3. Altrimenti: il primo modello il cui `alarmNamePattern` riconosce il nome.
4. Nessun modello: errore che elenca i modelli disponibili e ricorda `queryTemplate` e `queryAwsCloudWatch`.

Il catalogo si carica e si valida una volta all'avvio: id unici, campi obbligatori, espressioni compilabili.
`queryTemplate` con un id sconosciuto è un errore.

### 3.5 Risoluzione dei token statici

Quando la query viene da un modello, la query di risoluzione riparte dalle stesse righe e lavora sullo stesso campo:

```
<righe di query del modello>
| parse <patternField> "<glob>" as t0, t1, …
| filter ispresent(t0)
| stats count_distinct(t0) as cd0, earliest(t0) as v0, …
```

Così confronta solo le righe del pod e il testo da cui è nato il pattern (§1.2, punto 5). Con una query scritta a mano
(`queryAwsCloudWatch`) il comportamento non cambia: `parse @message`, sull'intero log group.

### 3.6 Codice

| File                                | Contenuto                                                                                                                                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/types/QueryTemplate.ts`        | Un modello del catalogo.                                                                                                                                                                               |
| `src/types/QueryTemplateCatalog.ts` | Il catalogo (`templates`).                                                                                                                                                                             |
| `src/types/AlarmQuery.ts`           | La query pronta per un allarme: `logGroup`, `query` (senza `pattern`), `patternField`, id del modello se c'è, variabili.                                                                               |
| `src/libs/query-templates.ts`       | Caricamento e validazione del catalogo (GOPaths + `GOJSONFileImporter`), scelta del modello, sostituzione delle variabili, composizione della query di `pattern`. Funzioni pure tranne il caricamento. |
| `src/libs/pattern-analyzer.ts`      | `buildPatternResolutionQuery` riceve la query di base e il campo, se ci sono.                                                                                                                          |
| `src/libs/alarm-analysis.ts`        | Risolve la `AlarmQuery` della voce e la passa a query e risoluzione.                                                                                                                                   |
| `src/config.ts`                     | Parametro `query.templates.file`.                                                                                                                                                                      |
| `src/types/PatternTypes.ts`         | `logGroup` e `queryAwsCloudWatch` facoltativi; nuovi `queryTemplate` e `queryVariables`.                                                                                                               |
| `configs/query-templates.json`      | Il catalogo della §3.2.                                                                                                                                                                                |
| `README.md`                         | Catalogo, scelta del modello, variabili, esempi.                                                                                                                                                       |

`main.ts` resta com'è: il catalogo si carica dentro `alarm-analysis.ts`, accanto al file di configurazione.

## 4. Test e verifica

### 4.1 Test unitari (`src/libs/__tests__/query-templates.test.ts`)

- I 7 nomi della §1.2 scelgono il modello giusto e ricavano `podApp` ed `env`; `pn-delivery-B2B-ApiGwAlarm` non ne
  sceglie nessuno.
- Precedenza: `queryAwsCloudWatch`, poi `queryTemplate`, poi `alarmNamePattern`; `queryVariables` vince sui gruppi.
- Errori: segnaposto senza valore, valore con caratteri non ammessi, id duplicato, espressione non valida,
  `queryTemplate` sconosciuto, nessun modello.
- La query composta finisce con `| pattern <patternField>`; il log group sostituisce `{{env}}`.

### 4.2 Test della risoluzione (`pattern-analyzer.test.ts`)

Con query di base e campo: la query di risoluzione inizia con le righe del modello e fa `parse` sul campo. Senza: è
identica a oggi.

### 4.3 Verifica su AWS (committente)

1. Rilanciare `config.json` (m2m-gateway-v3) e `notification-config.json` senza query: confrontare i pattern con
   quelli delle esecuzioni precedenti. Mi aspetto meno pattern e più leggibili per i 4 backend che oggi usano
   `pattern log`.
2. Con `resolveStaticTokens: true`, confrontare quanti token si risolvono prima e dopo la §3.5.

### 4.4 Gate

`pnpm --filter=go-report-error-patterns build`, `test`, `pnpm lint` sui file toccati.

## 5. Fuori da questa specifica

- **Modelli per allarmi non Interop** (SEND `pn-*`, API Gateway, Lambda, ECS): il meccanismo li regge (esempio nella
  §3.2), ma le query vanno scritte e provate su allarmi veri. Si aggiungono al catalogo quando servono, senza codice.
- **Ricavare il pod dentro Logs Insights** come nella query di Gaspare: scartato per i motivi della §3.3.
- **`dedup`, `display`, `sort` prima di `pattern`**: falsano i rapporti o non servono (§1.3).
- **Catalogo nel codice TypeScript**: avrebbe i tipi controllati in compilazione, ma ogni tipo nuovo richiederebbe
  una modifica del codice e una build. È la D1.
- **Riusare il catalogo dei runbook di `@pagopa/go-runbook`**: lì gli allarmi hanno già un inventario, ma il package
  è pubblicato e i modelli di questo script sono specifici dell'analisi dei pattern. Si può riconsiderare dopo.

## 6. Le scelte del committente

- **D1 · Dove sta il catalogo.** Proposta: file JSON `configs/query-templates.json`, sovrascrivibile da `data/`,
  validato all'avvio. In alternativa: costanti TypeScript nel codice.
- **D2 · Come si ricava il pod.** Proposta: in TypeScript dal nome dell'allarme, con `filter pod_app = "<pod>"`
  (§3.3). In alternativa: dentro la query, come Gaspare.
- **D3 · Filtro del modello backend.** Proposta: `ERROR` o `stderr` o 5xx, ed esclusione di `{"pod_app` e delle righe
  `   at` (§3.2). Nella query di Gaspare il 5xx è commentato: va tenuto?
- **D4 · Campo di `pattern` per il backend.** Proposta: `msg`. Oggi 4 file su 5 usano `log`; con `msg` i pattern
  cambiano rispetto alle esecuzioni già fatte.
- **D5 · Risoluzione dei token con i filtri del modello** (§3.5). Proposta: sì.
- **D6 · File di `configs/` esistenti.** Proposta: togliere `queryAwsCloudWatch` e `logGroup` dai 6 file reali;
  `config.example.json` mostra una voce con il modello e una con la query scritta a mano.
- **D7 · Allarme senza modello e senza query.** Proposta: errore (§3.4). In alternativa: un modello k8s generico di
  ripiego, con il rischio di analizzare con la query sbagliata senza accorgersene.
