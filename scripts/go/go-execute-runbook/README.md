# go-execute-runbook

> Versione: 1.0.0 | Autore: Team GO - Gestione Operativa

Esegue **un singolo runbook automatico Watchtower** partendo da una coppia già esistente:

- un `AlarmEvent` Watchtower (`--alarm-event-id`);
- una `AutomaticRunbookExecution` Watchtower (`--execution-id`).

Lo script non è un generatore di esecuzioni: la riga di execution deve essere già stata creata da Watchtower. In locale serve per riprodurre, diagnosticare o completare manualmente lo stesso ciclo che in cloud viene eseguito da `go-ExecuteRunbookLambda`.

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

| Componente                          | Ruolo                                                                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `scripts/go/go-execute-runbook`     | Core applicativo: prende `executionId` + `alarmEventId`, esegue il runbook e chiama le lifecycle API Watchtower. |
| `functions/go-ExecuteRunbookLambda` | Adapter AWS Lambda/SQS: legge il comando dalla coda FIFO e usa lo stesso core dello script.                      |
| `packages/go-watchtower-client`     | Client tipizzato generato dai contratti Watchtower (`OpenAPI` + JSON Schema comando SQS).                        |
| `scripts/go/go-analyze-alarm`       | Registry e motore dei runbook operativi usati per analizzare l'occorrenza.                                       |
| `contracts/runbook-automation/v1`   | Snapshot locale dei contratti pubblicati dal repo `go-watchtower`.                                               |

Il flow cloud ordinario è:

1. Watchtower crea o pianifica una `AutomaticRunbookExecution`.
2. Watchtower pubblica un comando su SQS FIFO per il worker.
3. `go-ExecuteRunbookLambda` riceve il messaggio.
4. La Lambda valida il comando e invoca il core di `go-execute-runbook`.
5. Il core chiama Watchtower con lifecycle idempotenti: `start`, `progress`, `complete` o `cancel/ack`.
6. Watchtower resta la fonte di verità dello stato, del risultato e del tracking.

L'uso locale salta il punto SQS/Lambda, ma non salta Watchtower: usa gli stessi endpoint lifecycle e modifica davvero la execution indicata.

## Quando usarlo in locale

Usalo localmente quando devi:

- riprodurre una execution automatica su un evento specifico;
- verificare che il service principal Watchtower sia configurato correttamente;
- debuggare un runbook senza passare dalla Lambda;
- controllare permessi AWS/OAM/CloudWatch Logs/Athena su un caso reale;
- validare una modifica al motore runbook prima di deployare il worker.

Non è pensato per:

- creare nuove execution Watchtower;
- fare replay massivo di molte occorrenze;
- simulare una run senza side effect;
- sostituire `go-rta-check`, che serve invece per confrontare molti runbook con analisi Watchtower.

## Come funziona

La CLI locale esegue questo percorso:

1. Legge la configurazione con `GOScript`.
2. Richiede `--alarm-event-id` e `--execution-id`; valori vuoti o solo spazi sono trattati come mancanti.
3. Costruisce il client Watchtower autenticato come service principal `runbook-automation-worker`.
4. Carica la password del service principal da:
   - `--watchtower-password` / `WATCHTOWER_PASSWORD`, oppure
   - `--watchtower-service-secret-arn` / `WATCHTOWER_SERVICE_SECRET_ARN` tramite AWS Secrets Manager.
5. Recupera l'`AlarmEvent` da Watchtower.
6. Costruisce il comando interno `AutomaticAlarmAnalysisCommandV1` con `trigger.kind = WATCHTOWER_API`.
7. Chiama `startExecution` su Watchtower con idempotency key locale.
8. Se Watchtower assegna un attempt, avvia il monitor di cancellazione cooperativa.
9. Cerca il runbook nel `RUNBOOK_REGISTRY` di `go-analyze-alarm`.
10. Esegue il runbook sull'occorrenza.
11. Classifica l'output e chiama `completeExecution`.
12. Se Watchtower richiede cancellazione, ferma le operazioni AWS attive e chiama `acknowledgeCancellation`.

La delivery locale usa:

| Campo                     | Valore locale        |
| ------------------------- | -------------------- |
| `sqsMessageId`            | `cli:<alarmEventId>` |
| `approximateReceiveCount` | `1`                  |
| `workerDeadlineAt`        | `now + 12 minuti`    |

Questo rende la run locale compatibile con il contratto cloud, pur non passando da SQS.

## Prerequisiti

| Requisito                | Dettaglio                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| Node.js                  | Versione supportata dal monorepo, tipicamente Node.js >= 24.                                             |
| pnpm                     | Versione supportata dal monorepo, tipicamente pnpm >= 10.                                                |
| Dipendenze installate    | Eseguire `pnpm install` dalla root del monorepo se necessario.                                           |
| Watchtower raggiungibile | La macchina locale deve raggiungere l'endpoint backend Watchtower.                                       |
| Execution Watchtower     | `--execution-id` deve riferirsi a una execution automatica esistente.                                    |
| Alarm event Watchtower   | `--alarm-event-id` deve riferirsi a un evento allarme esistente e leggibile.                             |
| Service principal        | Watchtower deve avere il principal `runbook-automation-worker` abilitato per gli endpoint lifecycle.     |
| Credenziali AWS          | Necessarie se usi Secrets Manager o se il runbook interroga CloudWatch Logs/Athena.                      |
| Permessi osservabilità   | L'account/profilo usato localmente deve vedere i log dell'account target, anche via OAM quando previsto. |

Se usi `--watchtower-service-secret-arn`, fai prima login SSO o esporta credenziali AWS valide:

```bash
aws sso login --profile sso_pn-analytics
```

Lo script non dichiara un parametro `--aws-profile`: le credenziali AWS vengono risolte dalla **AWS SDK default credential chain**. In locale usa quindi `AWS_PROFILE` e `AWS_REGION`:

```bash
export AWS_PROFILE=sso_pn-analytics
export AWS_REGION=eu-south-1
```

## Configurazione

### Parametri CLI

| Parametro                         | Env var                         | Obbligatorio | Default                     | Descrizione                                                         |
| --------------------------------- | ------------------------------- | ------------ | --------------------------- | ------------------------------------------------------------------- |
| `--alarm-event-id`                | `ALARM_EVENT_ID`                | Sì, per CLI  | -                           | UUID dell'occorrenza allarme Watchtower da analizzare.              |
| `--execution-id`                  | `EXECUTION_ID`                  | Sì, per CLI  | -                           | UUID della execution automatica Watchtower da completare.           |
| `--watchtower-url`                | `WATCHTOWER_URL`                | Sì           | -                           | Root del backend Watchtower. Un `/api` finale viene normalizzato.   |
| `--watchtower-service-id`         | `WATCHTOWER_SERVICE_ID`         | Sì           | `runbook-automation-worker` | Identificativo del service principal Watchtower.                    |
| `--watchtower-password`           | `WATCHTOWER_PASSWORD`           | No\*         | -                           | Password locale del service principal.                              |
| `--watchtower-service-secret-arn` | `WATCHTOWER_SERVICE_SECRET_ARN` | No\*         | -                           | ARN Secrets Manager che contiene la password del service principal. |

`*` Devi fornire almeno uno tra `--watchtower-password` e `--watchtower-service-secret-arn`.

### Note sui nomi

I nomi interni della config sono in dot notation (`alarm.event.id`, `watchtower.service.secret.arn`), ma da riga di comando si usano sempre flag kebab-case:

| Nome interno                    | Flag CLI                          |
| ------------------------------- | --------------------------------- |
| `alarm.event.id`                | `--alarm-event-id`                |
| `execution.id`                  | `--execution-id`                  |
| `watchtower.url`                | `--watchtower-url`                |
| `watchtower.service.id`         | `--watchtower-service-id`         |
| `watchtower.password`           | `--watchtower-password`           |
| `watchtower.service.secret.arn` | `--watchtower-service-secret-arn` |

### Password Watchtower

Opzione consigliata in locale:

```bash
export WATCHTOWER_PASSWORD='<password-service-principal>'
```

Evita di passare `--watchtower-password` direttamente nel comando quando possibile: resta nella shell history e può comparire nella process list.

Opzione consigliata per avvicinarsi al comportamento cloud:

```bash
export AWS_PROFILE=sso_pn-analytics
export AWS_REGION=eu-south-1
export WATCHTOWER_SERVICE_SECRET_ARN='arn:aws:secretsmanager:eu-south-1:<account>:secret:<name>'
```

Il secret deve contenere come `SecretString` la password del service principal.

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
3. Recupera o crea una `AutomaticRunbookExecution` locale.
4. Copia l'UUID della execution.
5. Copia l'UUID dell'`AlarmEvent` collegato.
6. Lancia `go-execute-runbook` puntando al backend locale.

Esempio con i valori locali:

```bash
WATCHTOWER_PASSWORD='pippo' \
pnpm --filter=go-execute-runbook dev -- \
  --alarm-event-id '<alarm-event-uuid-locale>' \
  --execution-id '<execution-uuid-locale>' \
  --watchtower-url 'http://localhost:3001/' \
  --watchtower-service-id 'runbook-automation-worker'
```

Stesso esempio usando variabili d'ambiente:

```bash
export WATCHTOWER_PASSWORD='pippo'
export WATCHTOWER_URL='http://localhost:3001/'
export WATCHTOWER_SERVICE_ID='runbook-automation-worker'

pnpm --filter=go-execute-runbook dev -- \
  --alarm-event-id '<alarm-event-uuid-locale>' \
  --execution-id '<execution-uuid-locale>'
```

In questa modalità non serve `--watchtower-service-secret-arn`: la password del service principal viene passata direttamente con `WATCHTOWER_PASSWORD`. Usa questo valore solo per l'istanza locale; per ambienti condivisi o produzione preferisci Secrets Manager.

### Esecuzione tipica con password da env

```bash
export WATCHTOWER_PASSWORD='<password-service-principal>'

pnpm --filter=go-execute-runbook dev -- \
  --alarm-event-id '<alarm-event-uuid>' \
  --execution-id '<execution-uuid>' \
  --watchtower-url 'https://watchtower.internal' \
  --watchtower-service-id 'runbook-automation-worker'
```

### Esecuzione tipica con Secrets Manager

```bash
aws sso login --profile sso_pn-analytics

AWS_PROFILE=sso_pn-analytics \
AWS_REGION=eu-south-1 \
pnpm --filter=go-execute-runbook dev -- \
  --alarm-event-id '<alarm-event-uuid>' \
  --execution-id '<execution-uuid>' \
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

Side effect reali:

- chiama il login Watchtower del service principal;
- legge l'`AlarmEvent`;
- avvia o osserva l'attempt della execution;
- esegue query CloudWatch Logs/Athena secondo il runbook;
- scrive progress/completion/cancellation su Watchtower;
- può completare una execution con esito `SUCCEEDED`, `FAILED`, `RUNNING`, `CANCEL_REQUESTED` o altro stato previsto dal contratto Watchtower.

Se Watchtower risponde che la execution è già `ALREADY_RUNNING`, `ALREADY_TERMINAL` o `CANCEL_REQUESTED`, lo script non forza un nuovo runbook: restituisce un esito soppresso e termina in modo coerente con lo stato remoto.

Se non esiste un runbook registrato per il nome allarme dell'evento, lo script completa comunque la execution con l'outcome standard "nessun runbook" invece di fallire tecnicamente.

## Troubleshooting

### `--alarm-event-id and --execution-id are required for CLI execution`

Manca almeno uno dei due ID richiesti, oppure è stato passato un valore vuoto:

```bash
--alarm-event-id ''
```

Recupera entrambi gli UUID da Watchtower: devono appartenere allo stesso flusso di runbook automatico.

### `Watchtower service password or secret ARN is required`

Non hai fornito né `WATCHTOWER_PASSWORD` / `--watchtower-password` né `WATCHTOWER_SERVICE_SECRET_ARN` / `--watchtower-service-secret-arn`.

### `Cannot read Watchtower service credential`

Lo script non riesce a leggere il secret da Secrets Manager. Controlla:

- `AWS_PROFILE`;
- `AWS_REGION`;
- `aws sso login`;
- ARN del secret;
- permesso `secretsmanager:GetSecretValue`;
- contenuto del secret.

### Errore 401 o 403 da Watchtower

Il service principal non è autenticato o non è autorizzato. Controlla:

- `--watchtower-service-id`;
- password del service principal;
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
- controlla che `AWS_PROFILE` punti a un account autorizzato;
- controlla eventuali permessi Athena/S3 se il runbook usa Athena.

### Processo locale interrotto dopo `startExecution`

La CLI locale non ha la coda SQS che ritenta automaticamente. Se il processo cade dopo `startExecution` e prima di `completeExecution`, controlla lo stato della execution in Watchtower prima di rilanciare. Potrebbe risultare già running, stale o terminale in base alla gestione server-side.

## Sicurezza

- Non committare password o ARN sensibili in esempi reali.
- Preferisci `WATCHTOWER_PASSWORD` o Secrets Manager a `--watchtower-password`.
- Non usare credenziali umane Watchtower: questo script è pensato per il service principal `runbook-automation-worker`.
- Non eseguire localmente contro produzione senza sapere quale execution stai completando.
- Ricorda che `--alarm-event-id` e `--execution-id` non sono segreti, ma identificano dati operativi reali: evita di incollarli in canali pubblici.
