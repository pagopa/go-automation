# go-execute-runbook

> Versione: 1.0.0 | Autore: Team GO - Gestione Operativa

Esegue **un singolo runbook automatico Watchtower** da locale o da worker cloud.

In locale il flusso consigliato parte solo da un `AlarmEvent` Watchtower (`--alarm-event-id`): la CLI crea su Watchtower una `AutomaticRunbookExecution` con `triggerKind = WATCHTOWER_CLI`, `dispatchKind = CLI` e utente umano tracciato tramite PAT scoped (`--watchtower-human-token` / `WATCHTOWER_HUMAN_TOKEN`).

Il vecchio uso con `--execution-id` resta supportato per completare una execution già esistente usando il service principal `runbook-automation-worker`, ed è il modello usato dal worker cloud `go-ExecuteRunbookLambda`.

## Indice

- [Contesto progetto](#contesto-progetto)
- [Quando usarlo in locale](#quando-usarlo-in-locale)
- [Come funziona](#come-funziona)
- [Prerequisiti](#prerequisiti)
- [Configurazione](#configurazione)
- [Utilizzo locale](#utilizzo-locale)
- [Prova con Watchtower locale](#prova-con-watchtower-locale)
- [Output e side effect](#output-e-side-effect)
- [Troubleshooting](#troubleshooting)
- [Sicurezza](#sicurezza)

## Contesto progetto

`go-execute-runbook` è il worker del flusso **Runbook automatici ⇄ Watchtower**.

Watchtower è il sistema che traccia prodotti, ambienti, allarmi, occorrenze di allarme e analisi operative. Quando un allarme scatta, Watchtower può creare una execution automatica e inviare un comando al worker. Il worker esegue il runbook associato all'allarme, classifica l'esito e richiama Watchtower per salvare lo stato dell'esecuzione.

Nel monorepo questo flusso è diviso in componenti:

| Componente                          | Ruolo                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `scripts/go/go-execute-runbook`     | Core applicativo: crea o riceve una execution, esegue il runbook e chiama le lifecycle API Watchtower. |
| `functions/go-ExecuteRunbookLambda` | Adapter AWS Lambda/SQS: legge il comando dalla coda FIFO e usa lo stesso core dello script.            |
| `packages/go-watchtower-client`     | Client tipizzato generato dai contratti Watchtower (`OpenAPI` + JSON Schema comando SQS).              |
| `scripts/go/go-analyze-alarm`       | Registry e motore dei runbook operativi usati per analizzare l'occorrenza.                             |
| `contracts/runbook-automation/v1`   | Snapshot locale dei contratti pubblicati dal repo `go-watchtower`.                                     |

Il flow cloud ordinario è:

1. Watchtower crea o pianifica una `AutomaticRunbookExecution`.
2. Watchtower pubblica un comando su SQS FIFO per il worker.
3. `go-ExecuteRunbookLambda` riceve il messaggio.
4. La Lambda valida il comando e invoca il core di `go-execute-runbook`.
5. Il core chiama Watchtower con lifecycle idempotenti: `start`, `progress`, `complete` o `cancel/ack`.
6. Watchtower resta la fonte di verità dello stato, del risultato e del tracking.

L'uso locale salta il punto SQS/Lambda, ma non salta Watchtower: di default crea una execution CLI reale e usa gli stessi endpoint lifecycle. Solo `--dry-run` evita scritture su Watchtower.

## Quando usarlo in locale

Usalo localmente quando devi:

- creare e lanciare localmente una execution automatica su un evento specifico;
- riprodurre una execution automatica già esistente passando `--execution-id`;
- verificare che il service principal Watchtower sia configurato correttamente;
- debuggare un runbook senza passare dalla Lambda;
- controllare permessi AWS/OAM/CloudWatch Logs/Athena su un caso reale;
- validare una modifica al motore runbook prima di deployare il worker.

Non è pensato per:

- fare replay massivo di molte occorrenze;
- sostituire `go-rta-check`, che serve invece per confrontare molti runbook con analisi Watchtower.

## Come funziona

La CLI locale ha due percorsi.

Percorso consigliato, **senza `--execution-id`**:

1. Legge la configurazione con `GOScript`.
2. Richiede `--alarm-event-id` e `--watchtower-human-token`; valori vuoti o solo spazi sono trattati come mancanti.
3. Autentica Watchtower con `/auth/cli-login` usando il PAT scoped dell'utente umano.
4. Se `--dry-run` è assente, crea una execution Watchtower via `/api/automatic-runbook-executions/cli`.
5. Se `--dry-run` è presente, chiama solo `/api/automatic-runbook-executions/cli/preview` e non crea execution.
6. Usa il command canonico restituito da Watchtower, con `trigger.kind = WATCHTOWER_CLI`.
7. Esegue il runbook localmente.
8. In una run reale chiama `start`, `progress`, `complete` o `cancel/ack`; in dry-run non chiama lifecycle.

Percorso legacy, **con `--execution-id`**:

1. Richiede `--alarm-event-id` e `--execution-id`.
2. Autentica Watchtower come service principal `runbook-automation-worker`.
3. Recupera l'`AlarmEvent` da Watchtower e costruisce il command locale.
4. Esegue lo stesso core lifecycle della Lambda.

In entrambi i percorsi inizializza i client AWS:

- in locale, se passi `--aws-profiles` / `AWS_PROFILES`, usa quei profili e abilita la risoluzione CloudWatch Logs multi-profilo;
- in Lambda/ECS/EC2 ignora i profili configurati e usa la default credential chain dell'ambiente AWS-managed.

La delivery locale usa:

| Campo                     | Valore locale       |
| ------------------------- | ------------------- |
| `sqsMessageId`            | `cli:<executionId>` |
| `approximateReceiveCount` | `1`                 |
| `workerDeadlineAt`        | `now + 120 secondi` |

Watchtower può restituire una `workerDeadlineAt` autoritativa diversa; heartbeat e complete usano sempre l'ultima deadline ricevuta.

## Prerequisiti

| Requisito                | Dettaglio                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| Node.js                  | Versione supportata dal monorepo, tipicamente Node.js >= 24.                                             |
| pnpm                     | Versione supportata dal monorepo, tipicamente pnpm >= 10.                                                |
| Dipendenze installate    | Eseguire `pnpm install` dalla root del monorepo se necessario.                                           |
| Watchtower raggiungibile | La macchina locale deve raggiungere l'endpoint backend Watchtower.                                       |
| Execution Watchtower     | Necessaria solo nel percorso legacy con `--execution-id`; nel nuovo percorso locale la crea la CLI.      |
| Alarm event Watchtower   | `--alarm-event-id` deve riferirsi a un evento allarme esistente e leggibile.                             |
| PAT CLI Watchtower       | Per creare execution o usare `--dry-run` serve un token `wtcli_...` generato dal profilo utente.         |
| Service principal        | Necessario solo per il percorso legacy o cloud con `--execution-id`.                                     |
| Credenziali AWS          | Necessarie se usi Secrets Manager o se il runbook interroga CloudWatch Logs/Athena.                      |
| Permessi osservabilità   | L'account/profilo usato localmente deve vedere i log dell'account target, anche via OAM quando previsto. |

Se usi `--aws-profiles` o `--watchtower-service-secret-arn`, fai prima login SSO sui profili necessari:

```bash
aws sso login --profile sso_pn-analytics
```

Per esecuzioni locali è consigliato passare i profili in modo esplicito con `--aws-profiles` oppure `AWS_PROFILES`:

```bash
export AWS_PROFILES=sso_pn-analytics
export AWS_REGION=eu-south-1
```

`AWS_PROFILE` resta utilizzabile solo come fallback della **AWS SDK default credential chain** quando non valorizzi `--aws-profiles` / `AWS_PROFILES`, ma in quel caso `GOScript` non valida il login SSO multi-profilo e CloudWatch Logs usa il comportamento cloud-like sul primo provider disponibile.

## Configurazione

### Parametri CLI

| Parametro                         | Alias  | Env var                         | Obbligatorio | Default                     | Descrizione                                                                                    |
| --------------------------------- | ------ | ------------------------------- | ------------ | --------------------------- | ---------------------------------------------------------------------------------------------- |
| `--alarm-event-id`                | -      | `ALARM_EVENT_ID`                | Sì           | -                           | UUID dell'occorrenza allarme Watchtower da analizzare.                                         |
| `--execution-id`                  | -      | `EXECUTION_ID`                  | No           | -                           | UUID della execution automatica Watchtower già esistente; attiva il percorso legacy service.   |
| `--aws-profiles`                  | `-aps` | `AWS_PROFILES`                  | No           | -                           | Profili AWS SSO, separati da virgola, da usare in locale per runbook multi-account.            |
| `--aws-region`                    | `-ar`  | `AWS_REGION`                    | No           | `eu-south-1`                | Regione AWS per i client locali e per eventuale lettura da Secrets Manager.                    |
| `--watchtower-url`                | -      | `WATCHTOWER_URL`                | Sì           | -                           | Root del backend Watchtower. Un `/api` finale viene normalizzato.                              |
| `--watchtower-human-token`        | -      | `WATCHTOWER_HUMAN_TOKEN`        | Sì\*         | -                           | PAT scoped `wtcli_...` dell'utente umano per create/preview/lifecycle CLI.                     |
| `--watchtower-service-id`         | -      | `WATCHTOWER_SERVICE_ID`         | No\*\*       | `runbook-automation-worker` | Identificativo del service principal Watchtower.                                               |
| `--watchtower-password`           | -      | `WATCHTOWER_PASSWORD`           | No\*\*       | -                           | Password locale del service principal.                                                         |
| `--watchtower-service-secret-arn` | -      | `WATCHTOWER_SERVICE_SECRET_ARN` | No\*\*       | -                           | ARN Secrets Manager che contiene la password del service principal; usa il primo profilo AWS.  |
| `--dry-run`                       | -      | `DRY_RUN`                       | No           | `false`                     | Non crea execution e non scrive lifecycle su Watchtower; esegue comunque query AWS reali.      |
| `--dry-run-timeout-ms`            | -      | `DRY_RUN_TIMEOUT_MS`            | No           | -                           | Timeout locale opzionale del dry-run in millisecondi. Se omesso, non applica un budget locale. |
| `--apply`                         | -      | `APPLY`                         | No           | `none`                      | `none`, `known`, `all`; mappa a `SHADOW`, `APPLY_KNOWN`, `APPLY_ALL`.                          |
| `--confirm-apply`                 | -      | `CONFIRM_APPLY`                 | No           | `false`                     | Conferma apply `known/all` verso URL Watchtower non locali.                                    |
| `--confirm-apply-all`             | -      | `CONFIRM_APPLY_ALL`             | No           | `false`                     | Conferma aggiuntiva per `--apply all`.                                                         |

`*` Richiesto quando non passi `--execution-id`.

`**` Richiesto solo nel percorso legacy/cloud con `--execution-id`: devi fornire almeno uno tra `--watchtower-password` e `--watchtower-service-secret-arn`.

### Note sui nomi

I nomi interni della config sono in dot notation (`alarm.event.id`, `watchtower.service.secret.arn`), ma da riga di comando si usano sempre flag kebab-case:

| Nome interno                    | Flag CLI                          |
| ------------------------------- | --------------------------------- |
| `alarm.event.id`                | `--alarm-event-id`                |
| `execution.id`                  | `--execution-id`                  |
| `aws.profiles`                  | `--aws-profiles`                  |
| `aws.region`                    | `--aws-region`                    |
| `watchtower.url`                | `--watchtower-url`                |
| `watchtower.service.id`         | `--watchtower-service-id`         |
| `watchtower.password`           | `--watchtower-password`           |
| `watchtower.service.secret.arn` | `--watchtower-service-secret-arn` |
| `watchtower.human.token`        | `--watchtower-human-token`        |
| `dry.run`                       | `--dry-run`                       |
| `dry.run.timeout.ms`            | `--dry-run-timeout-ms`            |
| `apply`                         | `--apply`                         |
| `confirm.apply`                 | `--confirm-apply`                 |
| `confirm.apply.all`             | `--confirm-apply-all`             |

### Password Watchtower

Opzione consigliata in locale:

```bash
export WATCHTOWER_PASSWORD='<password-service-principal>'
```

Evita di passare `--watchtower-password` direttamente nel comando quando possibile: resta nella shell history e può comparire nella process list.

Opzione consigliata per avvicinarsi al comportamento cloud usando Secrets Manager:

```bash
export AWS_PROFILES=sso_pn-analytics
export AWS_REGION=eu-south-1
export WATCHTOWER_SERVICE_SECRET_ARN='arn:aws:secretsmanager:eu-south-1:<account>:secret:<name>'
```

Il secret deve contenere come `SecretString` la password del service principal.

### Profili AWS locali

`--aws-profiles` è lo stesso parametro usato da `go-analyze-alarm` per gestire runbook che devono interrogare log distribuiti su più account. I profili sono separati da virgola:

```bash
pnpm --filter=go-execute-runbook dev -- \
  --aws-profiles 'sso_pn-core-dev,sso_pn-confinfo-dev' \
  --aws-region 'eu-south-1' \
  ...
```

Quando `--aws-profiles` è valorizzato e lo script gira localmente, CloudWatch Logs usa la modalità `search-configured-profiles`: per ogni log group prova i profili configurati nell'ordine indicato e memorizza il profilo che ha funzionato. Questo serve per i runbook che attraversano più account o servizi.

Quando `--aws-profiles` non è valorizzato, lo script usa la default credential chain SDK. In questa modalità il comportamento è più vicino al worker cloud: CloudWatch Logs interroga l'account target dell'evento tramite il provider disponibile e OAM, se configurato.

In Lambda i profili configurati vengono ignorati: il worker usa il ruolo di esecuzione e il target account/region dell'`AlarmEvent`.

## Utilizzo locale

### Prova con Watchtower locale

Se Watchtower è avviato in locale con:

| Servizio            | URL locale               | Uso                                                         |
| ------------------- | ------------------------ | ----------------------------------------------------------- |
| Frontend Watchtower | `http://localhost:3002`  | UI per navigare prodotti, allarmi, occorrenze ed execution. |
| Backend Watchtower  | `http://localhost:3001/` | API da passare allo script con `--watchtower-url`.          |

Usa sempre il backend (`http://localhost:3001/`) come `--watchtower-url`. Il frontend (`http://localhost:3002`) serve solo per recuperare o controllare gli ID dalla UI.

Procedura consigliata:

1. Verifica che backend e frontend Watchtower siano entrambi in esecuzione.
2. Apri `http://localhost:3002`.
3. Genera un token CLI dal profilo utente Watchtower.
4. Copia l'UUID dell'`AlarmEvent` da analizzare.
5. Lancia `go-execute-runbook` puntando al backend locale.

Esempio con i valori locali:

```bash
WATCHTOWER_HUMAN_TOKEN='wtcli_xxx' \
pnpm --filter=go-execute-runbook dev -- \
  --alarm-event-id '<alarm-event-uuid-locale>' \
  --aws-profiles '<profilo-aws-1>,<profilo-aws-2>' \
  --aws-region 'eu-south-1' \
  --watchtower-url 'http://localhost:3001/'
```

Stesso esempio usando variabili d'ambiente:

```bash
export WATCHTOWER_HUMAN_TOKEN='wtcli_xxx'
export WATCHTOWER_URL='http://localhost:3001/'
export AWS_PROFILES='<profilo-aws-1>,<profilo-aws-2>'
export AWS_REGION='eu-south-1'

pnpm --filter=go-execute-runbook dev -- \
  --alarm-event-id '<alarm-event-uuid-locale>'
```

In questa modalità non serve il secret del service principal: l'utente umano viene tracciato da Watchtower tramite il PAT scoped.

Dry-run locale:

```bash
WATCHTOWER_HUMAN_TOKEN='wtcli_xxx' \
pnpm --filter=go-execute-runbook dev -- \
  --alarm-event-id '<alarm-event-uuid-locale>' \
  --watchtower-url 'http://localhost:3001/' \
  --aws-profiles '<profilo-aws-1>,<profilo-aws-2>' \
  --dry-run
```

`--dry-run` non crea execution e non scrive su Watchtower, ma il runbook locale può comunque leggere log e lanciare query AWS reali. Se vuoi un budget locale, passa `--dry-run-timeout-ms <millisecondi>`; `Ctrl-C` viene inoltrato al runbook locale per fermare le operazioni attive.

Esecuzione locale che applica solo casi noti:

```bash
WATCHTOWER_HUMAN_TOKEN='wtcli_xxx' \
pnpm --filter=go-execute-runbook dev -- \
  --alarm-event-id '<alarm-event-uuid-locale>' \
  --watchtower-url 'http://localhost:3001/' \
  --aws-profiles '<profilo-aws-1>,<profilo-aws-2>' \
  --apply known
```

Contro una URL non locale, `--apply known` e `--apply all` richiedono conferma interattiva oppure `--confirm-apply`. `--apply all` richiede anche `--confirm-apply-all`.

### Esecuzione legacy con execution esistente e password da env

```bash
export WATCHTOWER_PASSWORD='<password-service-principal>'

pnpm --filter=go-execute-runbook dev -- \
  --alarm-event-id '<alarm-event-uuid>' \
  --execution-id '<execution-uuid>' \
  --watchtower-url 'https://watchtower.internal' \
  --watchtower-service-id 'runbook-automation-worker'
```

### Esecuzione legacy con execution esistente e Secrets Manager

```bash
aws sso login --profile sso_pn-analytics

pnpm --filter=go-execute-runbook dev -- \
  --alarm-event-id '<alarm-event-uuid>' \
  --execution-id '<execution-uuid>' \
  --aws-profiles 'sso_pn-analytics' \
  --aws-region 'eu-south-1' \
  --watchtower-url 'https://watchtower.internal' \
  --watchtower-service-id 'runbook-automation-worker' \
  --watchtower-service-secret-arn 'arn:aws:secretsmanager:eu-south-1:<account>:secret:<name>'
```

### Build + runtime compilato

```bash
pnpm --filter=go-execute-runbook build

WATCHTOWER_PASSWORD='<password-service-principal>' \
pnpm --filter=go-execute-runbook start -- \
  --alarm-event-id '<alarm-event-uuid>' \
  --execution-id '<execution-uuid>' \
  --watchtower-url 'https://watchtower.internal'
```

`start` ricompila prima di eseguire `dist/index.js`. Usa `dev` quando stai iterando sul TypeScript sorgente.

### Verifiche locali senza chiamare Watchtower

I test unitari coprono parsing comando, classificazione, cancellazione cooperativa e core execution con client mock:

```bash
pnpm --filter=go-execute-runbook test
```

Per verificare il tipo TypeScript dell'intero monorepo:

```bash
pnpm type-check
```

## Output e side effect

Lo script stampa in console l'esito sintetico:

```text
Execution <execution-id>: <status> (<disposition>)
```

Gli output applicativi non vengono salvati come report locale: il risultato utile viene persistito su Watchtower tramite la callback `completeExecution`.

Side effect reali senza `--dry-run`:

- chiama il login Watchtower via PAT CLI oppure service principal;
- crea una execution CLI se non hai passato `--execution-id`;
- avvia o osserva l'attempt della execution Watchtower;
- esegue query CloudWatch Logs/Athena secondo il runbook;
- scrive progress/completion/cancellation su Watchtower;
- può completare una execution con esito `SUCCEEDED`, `FAILED`, `RUNNING`, `CANCEL_REQUESTED` o altro stato previsto dal contratto Watchtower.

Side effect con `--dry-run`:

- chiama Watchtower solo per login e preview del command;
- non crea execution;
- non chiama `start`, `progress`, `complete`, `fail` o `cancel/ack`;
- esegue comunque il runbook locale, quindi può fare query AWS reali.

Se Watchtower risponde che la execution è già `ALREADY_RUNNING`, `ALREADY_TERMINAL` o `CANCEL_REQUESTED`, lo script non forza un nuovo runbook: restituisce un esito soppresso e termina in modo coerente con lo stato remoto.

Se non esiste un runbook registrato per il nome allarme dell'evento, lo script completa comunque la execution con l'outcome standard "nessun runbook" invece di fallire tecnicamente.

## Troubleshooting

### `--alarm-event-id is required for CLI execution`

Manca l'UUID dell'AlarmEvent, oppure è stato passato un valore vuoto:

```bash
--alarm-event-id ''
```

Recupera l'UUID da Watchtower. Se non passi `--execution-id`, la CLI crea la execution.

### `--watchtower-human-token is required when --execution-id is not provided`

Stai usando il nuovo percorso locale, ma manca il PAT CLI. Genera un token dal profilo utente Watchtower e passalo con:

```bash
export WATCHTOWER_HUMAN_TOKEN='wtcli_xxx'
```

### `Watchtower service password or secret ARN is required`

Non hai fornito né `WATCHTOWER_PASSWORD` / `--watchtower-password` né `WATCHTOWER_SERVICE_SECRET_ARN` / `--watchtower-service-secret-arn`.

### `Cannot read Watchtower service credential`

Lo script non riesce a leggere il secret da Secrets Manager. Controlla:

- `AWS_PROFILE`;
- `AWS_PROFILES`;
- `AWS_REGION`;
- `aws sso login`;
- ARN del secret;
- permesso `secretsmanager:GetSecretValue`;
- contenuto del secret.

### Errore 401 o 403 da Watchtower

Il principal non è autenticato o non è autorizzato. Controlla:

- `--watchtower-human-token` per il nuovo percorso locale;
- `--watchtower-service-id` e password del service principal per il percorso legacy;
- ruolo/abilitazione lato Watchtower;
- URL Watchtower corretto;
- eventuale ambiente/stage sbagliato.

### Errore 404 su `AlarmEvent` o execution

Uno degli ID non esiste nell'istanza Watchtower indicata da `--watchtower-url`, oppure stai puntando allo stage sbagliato.

### Execution già in stato terminale

Se Watchtower restituisce `ALREADY_TERMINAL`, la execution è già stata completata o fallita. In locale non viene rilanciata automaticamente. Crea o seleziona una nuova execution da Watchtower.

### Runbook bloccato o query senza risultati

Il runbook usa i dati dell'`AlarmEvent`: nome allarme, timestamp `firedAt`, account AWS e regione. Se i log non sono visibili:

- verifica OAM e permessi cross-account;
- verifica che l'account target sia quello dell'evento;
- controlla retention dei log;
- controlla che `--aws-profiles` / `AWS_PROFILES` includa i profili autorizzati;
- se non usi `--aws-profiles`, controlla che `AWS_PROFILE` punti a un account autorizzato;
- controlla eventuali permessi Athena/S3 se il runbook usa Athena.

### Processo locale interrotto dopo `startExecution`

La CLI locale non ha la coda SQS che ritenta automaticamente. Se il processo cade dopo `startExecution` e prima di `completeExecution`, controlla lo stato della execution in Watchtower prima di rilanciare. Potrebbe risultare già running, stale o terminale in base alla gestione server-side.

## Sicurezza

- Non committare password o ARN sensibili in esempi reali.
- Preferisci `WATCHTOWER_PASSWORD` o Secrets Manager a `--watchtower-password`.
- Per il nuovo percorso locale usa solo PAT scoped `wtcli_...`, non password utente.
- Il service principal `runbook-automation-worker` resta per Lambda e percorso legacy con `--execution-id`.
- Non eseguire localmente contro produzione senza sapere quale `AlarmEvent` stai usando e quale `--apply` hai scelto.
- `--apply known` e `--apply all` possono creare o aggiornare `AlarmAnalysis` reali; contro URL non locali usa `--confirm-apply` solo dopo verifica esplicita.
- `--dry-run` non scrive su Watchtower, ma può leggere log di produzione e generare costi/query AWS.
- Ricorda che `--alarm-event-id` e `--execution-id` non sono segreti, ma identificano dati operativi reali: evita di incollarli in canali pubblici.
