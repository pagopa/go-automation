# AWS Schedule EventBridge

> Versione: 1.0.0 | Autore: Team GO - Gestione Operativa

Script per operare sugli schedule di **Amazon EventBridge Scheduler** su **più account AWS in una sola invocazione**: elencarli, ispezionarli nel dettaglio, abilitarli o disabilitarli.

## Indice

- [Funzionalità](#funzionalità)
- [Prerequisiti](#prerequisiti)
- [Configurazione](#configurazione)
- [Utilizzo](#utilizzo)
- [Output](#output)
- [Troubleshooting](#troubleshooting)

## Funzionalità

- `list` — elenca gli schedule di un gruppo in **tutti** gli account indicati, con filtri opzionali per prefisso del nome e per stato. La paginazione dell'API è gestita internamente: il risultato è sempre completo.
- `describe` — stampa tutti i campi di uno schedule (espressione, timezone, target con input e parametri service-specific, retry policy, DLQ, finestra flessibile, KMS key, date) per ogni account, più una tabella di confronto cross-account quando gli account sono più di uno.
- `enable` / `disable` — porta **un solo schedule** allo stato richiesto in **tutti** gli account indicati: mostra prima cosa cambierà in ciascuno, chiede una conferma sola per l'intero batch, poi applica e riporta l'esito per account.

### Perché enable/disable rileggono lo schedule

`UpdateSchedule` dell'API Scheduler è una **sostituzione integrale**: ogni campo non presente nella richiesta viene riportato al valore di default di sistema. Inviare solo `{ Name, State }` azzererebbe `Description`, `Target`, `RetryPolicy`, `StartDate`, `KmsKeyArn` e il resto della configurazione.

Lo script (tramite `AWSSchedulerService` di go-common) esegue quindi sempre `GetSchedule` e rinvia tutti i campi scrivibili invariati, cambiando solo `State`. Se lo stato richiesto è già quello corrente, nessun `UpdateSchedule` viene emesso.

La rilettura **restringe** la finestra fra la preview e la scrittura, ma non la chiude: `GetSchedule` e `UpdateSchedule` sono due chiamate separate e Scheduler non offre una scrittura condizionale, quindi una modifica di configurazione che arriva **fra** le due viene sovrascritta dallo snapshot appena letto. Viene intercettato solo un cambio di _stato_ che raggiunge il target prima della rilettura, e viene riportato come `UNCHANGED`.

In pratica la race residua è stretta (i millisecondi di una `UpdateSchedule`) e il sweep è idempotente, ma se un altro processo può riconfigurare lo stesso schedule va coordinato fuori da questo script.

### Scope e blast radius

- Il target è sempre **un solo `--schedule-name`**: nessuna wildcard, nessuna operazione bulk per nome.
- Il blast radius è però **N account in una region**: tutti quelli elencati in `--aws-profiles`.
- La **preview mostra ogni account** prima di scrivere: stato attuale, account id e azione pianificata (`UPDATE`, `NO-OP`, `MISSING`, `ERROR`).
- **Una sola conferma** copre l'intero batch, con bypass esplicito `--yes` per l'uso non interattivo. Chiedere per account addestrerebbe l'operatore a tenere premuto `y`.
- Gli account in cui lo schedule **non esiste** sono riportati come drift e **non** fanno fallire il run, salvo `--fail-on-missing`.
- Un **fallimento parziale esce non-zero**: se anche un solo account non converge, il processo termina con errore. Il sweep è idempotente, quindi la ri-esecuzione è sicura.
- Nessuna scrittura su disco: l'output è solo tabellare su stdout.

### Modalità multi-account

- **Una sola region per run.** Non esiste un parametro `aws.regions`: spazzare una flotta cross-region sono due invocazioni.
- **SSO validato per tutti i profili prima di `main`**: il framework valida le credenziali in parallelo, chiede conferma una volta sola ed esegue i login in sequenza.
- Se **alcuni** profili non superano la validazione il run **continua** e li riporta come errori per-profilo; il framework aborta solo se falliscono **tutti**.
- Gli account sono interrogati **in parallelo, senza cap di concorrenza**. È la scelta corretta per una manciata di account; se un giorno servisse spazzarne cinquanta, la risposta è un pool in go-common, non una manopola qui.
- Le voci di `--aws-profiles` sono **deduplicate** mantenendo l'ordine di dichiarazione, che è anche l'ordine delle righe in output.
- Una voce può contenere un suffisso `profilo:fallback` che viene **strippato**: è una feature di CloudWatch Logs, irrilevante qui, ma spiega perché i due punti sono accettati. Attenzione: un `profilo:` con suffisso vuoto è un errore di parsing, non un profilo semplice.

## Prerequisiti

### Software Richiesto

| Software   | Versione Minima | Note                 |
| ---------- | --------------- | -------------------- |
| Node.js    | >= 22.14        | LTS consigliata      |
| pnpm       | >= 10.28        | Package manager      |
| TypeScript | >= 5.0.0        | Incluso nel progetto |

### Account e Permessi

- [ ] Accesso AWS con un profilo SSO configurato **per ogni account** da spazzare
- [ ] Permessi IAM **in ogni account**: `scheduler:ListSchedules`, `scheduler:GetSchedule`, `scheduler:UpdateSchedule`, `sts:GetCallerIdentity`
- [ ] `sts:GetCallerIdentity` serve a mostrare l'account id nelle tabelle. Se manca, il run **non** fallisce: l'account id è riportato come `-`
- [ ] Per `enable`/`disable` serve anche `iam:PassRole` sul role usato dal target dello schedule, perché `UpdateSchedule` rinvia il `RoleArn` del target

### Credenziali AWS

Configurare le credenziali AWS utilizzando AWS SSO, una volta per profilo:

```bash
aws sso login --profile <nome-profilo>
```

Lo script esegue comunque la validazione (e, se serve, il login) di tutti i profili all'avvio.

## Configurazione

### Parametri CLI

| Parametro           | Alias | Tipo     | Obbligatorio                   | Default      | Descrizione                                                                 |
| ------------------- | ----- | -------- | ------------------------------ | ------------ | --------------------------------------------------------------------------- |
| `--aws-profiles`    | `aps` | string[] | sì                             | —            | Nomi dei profili AWS SSO, uno per account da spazzare (separati da virgola) |
| `--aws-region`      | `ar`  | string   | no                             | `eu-south-1` | Region che ospita gli schedule                                              |
| `--action`          | `a`   | string   | sì                             | —            | Azione da eseguire: `list`, `describe`, `enable`, `disable`                 |
| `--schedule-name`   | `n`   | string   | sì per describe/enable/disable | —            | Nome dello schedule su cui operare                                          |
| `--schedule-group`  | `g`   | string   | no                             | `default`    | Gruppo di schedule proprietario dello schedule                              |
| `--name-prefix`     | `p`   | string   | no                             | —            | Filtro per prefisso del nome, usato solo da `list`                          |
| `--state`           | `s`   | string   | no                             | —            | Filtro per stato, usato solo da `list`: `ENABLED` o `DISABLED`              |
| `--yes`             | `y`   | bool     | no                             | `false`      | Salta la conferma interattiva che copre l'intero batch di account           |
| `--fail-on-missing` | `fom` | bool     | no                             | `false`      | Tratta un account senza lo schedule come fallimento invece che come drift   |

### Variabili d'Ambiente

Ogni parametro è leggibile anche da variabile d'ambiente, con il nome derivato da GOScript.

| Variabile         | Descrizione                          | Esempio            |
| ----------------- | ------------------------------------ | ------------------ |
| `AWS_PROFILES`    | Profili AWS SSO, separati da virgola | `sso_dev,sso_prod` |
| `AWS_REGION`      | Region AWS                           | `eu-south-1`       |
| `SCHEDULE_NAME`   | Nome dello schedule                  | `nightly-job`      |
| `SCHEDULE_GROUP`  | Gruppo dello schedule                | `default`          |
| `FAIL_ON_MISSING` | Rende fatale uno schedule assente    | `true`             |

> `AWS_PROFILES` è un nome **derivato da GOScript** dal parametro `aws.profiles`, non la `AWS_PROFILE` dell'SDK AWS. Lo script non dichiara più `aws.profile`, quindi una `AWS_PROFILE` nell'ambiente non viene letta: va usata `AWS_PROFILES` (o `--aws-profiles`).

### Priorità di Configurazione

1. Parametri CLI (priorità massima)
2. Variabili d'ambiente
3. File di configurazione
4. Valori di default

## Utilizzo

### Modalità Development (via pnpm/tsx)

```bash
# Dalla root del monorepo
pnpm go aws-schedule-eventbridge --action list --aws-profiles <profilo-a>,<profilo-b>

# Oppure con filter
pnpm --filter=aws-schedule-eventbridge dev -- --action list --aws-profiles <profilo-a>,<profilo-b>
```

### Modalità Production (build + node)

```bash
# Build
pnpm --filter=aws-schedule-eventbridge build

# Esecuzione
pnpm --filter=aws-schedule-eventbridge start -- --action list --aws-profiles <profilo-a>,<profilo-b>
```

### Esempi Pratici

```bash
# Elenco degli schedule del gruppo default in due account
pnpm go aws-schedule-eventbridge --action list --aws-profiles sso_dev,sso_prod

# Solo gli schedule attivi, filtrati per prefisso, su tutta la flotta
pnpm go aws-schedule-eventbridge --action list --aws-profiles sso_dev,sso_uat,sso_prod \
  --schedule-group batch --name-prefix nightly --state ENABLED

# Dettaglio di uno schedule in ogni account, con tabella di confronto
pnpm go aws-schedule-eventbridge --action describe --aws-profiles sso_dev,sso_prod \
  --schedule-name nightly-job

# Verificare che lo schedule esista davvero in ogni account (drift fatale)
pnpm go aws-schedule-eventbridge --action describe --aws-profiles sso_dev,sso_uat,sso_prod \
  --schedule-name nightly-job --fail-on-missing

# Disabilitare lo schedule in due account (con conferma interattiva unica)
pnpm go aws-schedule-eventbridge --action disable --aws-profiles sso_dev,sso_prod \
  --schedule-name nightly-job

# Riabilitarlo su tutta la flotta senza conferma (uso non interattivo)
pnpm go aws-schedule-eventbridge --action enable --aws-profiles sso_dev,sso_uat,sso_prod \
  --schedule-name nightly-job --yes

# Un solo account: è il caso degenere del sweep, non un modo diverso di invocarlo
pnpm go aws-schedule-eventbridge --action disable --aws-profiles sso_prod \
  --schedule-name nightly-job
```

## Output

Tutto l'output è su stdout, in forma tabellare: non vengono prodotti file.

### `list` — tabella unica, una riga per schedule per account

```
+------------------+--------------------+----------+----------+------------------------------+------------------------+
| Profile          | Name               | Group    | State    | Target ARN                   | Last Modified          |
+------------------+--------------------+----------+----------+------------------------------+------------------------+
| sso_dev          | nightly-job        | default  | ENABLED  | arn:aws:lambda:...:reconcile | 2026-09-15T08:30:00Z   |
| sso_dev          | weekly-cleanup     | default  | DISABLED | arn:aws:lambda:...:cleanup   | 2026-08-02T12:00:00Z   |
| sso_prod         | nightly-job        | default  | ENABLED  | arn:aws:lambda:...:reconcile | 2026-09-20T10:00:00Z   |
+------------------+--------------------+----------+----------+------------------------------+------------------------+

  sso_dev: 2 schedule(s).
  sso_prod: 1 schedule(s).
  [OK] Found 3 schedule(s) across 2 of 2 account(s).
```

Un account senza risultati produce un warning e nessuna riga; un account fallito produce un errore. Il run fallisce solo se **tutti** gli account falliscono.

### `describe` — un blocco per account, più il confronto

Per ogni account riporta `Name`, `Group`, `State`, `ARN`, `Description`, `Schedule Expression`, `Timezone`, `Start Date`, `End Date`, la finestra flessibile, il target (ARN, role, DLQ, `Target Input`, retry policy), `Action After Completion`, `KMS Key ARN` e le date di creazione/ultima modifica.

`Target Parameters` riporta il blocco di parametri service-specific dichiarato dal target — `EcsParameters`, `EventBridgeParameters`, `KinesisParameters`, `SageMakerPipelineParameters` o `SqsParameters` — serializzato in JSON su una riga sola: sono mutuamente esclusivi in pratica, quindi non meritano una colonna ciascuno.

Con più di un account segue la tabella di confronto, limitata ai campi che driftano davvero:

```
> Cross-account comparison
+------------------+--------------+----------+--------------------------+------------------+
| Profile          | Account      | State    | Schedule Expression      | Timezone         |
+------------------+--------------+----------+--------------------------+------------------+
| sso_dev          | 111122223333 | ENABLED  | cron(0 2 * * ? *)        | Europe/Rome      |
| sso_prod         | 444455556666 | DISABLED | cron(0 3 * * ? *)        | UTC              |
+------------------+--------------+----------+--------------------------+------------------+
```

Un account senza lo schedule compare con `State` a `MISSING`, uno illeggibile con `ERROR`.

### `enable` / `disable` — preview, conferma, sintesi

**1. Preview**, prima di qualunque scrittura:

```
> Planned sweep to DISABLED
+------------------+--------------+----------------+----------------+----------+----------------------------------+
| Profile          | Account      | Current State  | Target State   | Action   | Detail                           |
+------------------+--------------+----------------+----------------+----------+----------------------------------+
| sso_dev          | 111122223333 | ENABLED        | DISABLED       | UPDATE   | -                                |
| sso_uat          | 777788889999 | ENABLED        | DISABLED       | UPDATE   | -                                |
| sso_prod         | 444455556666 | DISABLED       | -              | NO-OP    | -                                |
| sso_hotfix       | 222233334444 | -              | -              | MISSING  | schedule not present in this ... |
+------------------+--------------+----------------+----------------+----------+----------------------------------+
```

**2. Conferma**, una sola per tutto il batch:

```
? Set schedule "nightly-job" to DISABLED in 2 of 4 account(s) [sso_dev, sso_uat]? 1 account(s) do not have it. (y/N)
```

**3. Esito e sintesi**, una riga per account configurato:

```
> Sweep result
+------------------+--------------+--------------+--------------+------------------------------------------+
| Profile          | Outcome      | From         | To           | Detail                                   |
+------------------+--------------+--------------+--------------+------------------------------------------+
| sso_dev          | CHANGED      | ENABLED      | DISABLED     | arn:aws:scheduler:...:nightly-job        |
| sso_uat          | CHANGED      | ENABLED      | DISABLED     | arn:aws:scheduler:...:nightly-job        |
| sso_prod         | SKIPPED      | -            | -            | -                                        |
| sso_hotfix       | SKIPPED      | -            | -            | -                                        |
+------------------+--------------+--------------+--------------+------------------------------------------+

  [OK] 2 changed, 1 unchanged, 0 pending, 1 missing, 0 failed of 4 account(s).
```

I cinque contatori partizionano gli account: ogni account cade in esattamente uno, quindi la loro somma è sempre il numero di profili configurati. Se la flotta non converge la riga di sintesi è un errore e il processo esce non-zero.

La preview è l'unico modo di vedere cosa cambierebbe senza scrivere: va letta e poi rifiutata alla conferma. Un `--dry-run` non interattivo richiede il supporto dry-run di go-common, che su questa base non c'è ancora.

## Troubleshooting

### Problemi Comuni

#### Errore: "AWS credentials not found"

**Causa**: Profilo AWS non configurato o sessione SSO scaduta.

**Soluzione**:

```bash
aws sso login --profile <nome-profilo>
```

Se il run riporta l'errore solo per alcuni profili, gli altri sono stati comunque elaborati: va rifatto il login dei soli profili segnalati.

#### Il sweep riporta un fallimento solo in alcuni account

**Causa**: Esito atteso. L'exit code non-zero su fallimento parziale è **intenzionale**: serve a far accorgere CI e operatore che la flotta non è convergiuta. Gli account sani sono comunque stati aggiornati.

**Soluzione**: leggere la tabella `Sweep result` per capire quali account hanno fallito e perché, poi **ri-eseguire lo stesso comando**: il sweep è idempotente e gli account già allineati risultano `NO-OP`.

#### Un account riporta `MISSING`

**Causa**: Lo schedule non esiste in quell'account, nel gruppo indicato. È **drift di configurazione, non un errore**: il sweep lo riporta e prosegue.

**Soluzione**: se la presenza in tutti gli account è un invariante da verificare, usare `--fail-on-missing` per renderlo fatale. Se il gruppo è diverso da `default`, controllare `--schedule-group`.

#### Errore: `ResourceNotFoundException`

**Causa**: Lo schedule non esiste nel gruppo indicato, in **uno o più** degli account interrogati. Il gruppo di default è `default`: uno schedule creato in un gruppo diverso va cercato con `--schedule-group`.

**Soluzione**: verificare il nome e il gruppo in ciascun account con `--action list --aws-profiles <...> --schedule-group <gruppo>`. Nelle azioni di questo script l'errore non viene propagato così: è classificato come `MISSING` sul singolo account.

#### Errore: `Invalid action "..."`

**Causa**: Valore di `--action` non supportato.

**Soluzione**: usare uno fra `list`, `describe`, `enable`, `disable`.

#### La conferma non compare

**Causa**: `--yes` è attivo, oppure nessun account ha bisogno di cambiare stato, oppure lo script gira in un contesto non interattivo.

**Soluzione**: rimuovere `--yes` per ripristinare il gate di conferma. Se la preview mostra solo `NO-OP` e `MISSING`, non c'è niente da confermare.

#### Errore: "Module not found"

**Causa**: Dipendenze non installate o build non eseguito.

**Soluzione**:

```bash
pnpm install
pnpm build:common
pnpm --filter=aws-schedule-eventbridge build
```

### Debug Mode

```bash
# Type check senza build
pnpm --filter=aws-schedule-eventbridge exec tsc --noEmit
```

---

**Ultima modifica**: 2026-10-02
**Maintainer**: Team GO - Gestione Operativa
