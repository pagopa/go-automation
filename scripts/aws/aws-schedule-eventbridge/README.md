# AWS Schedule EventBridge

> Versione: 1.0.0 | Autore: Team GO - Gestione Operativa

Script per operare sugli schedule di **Amazon EventBridge Scheduler**: elencarli, ispezionarne uno nel dettaglio, abilitarlo o disabilitarlo.

## Indice

- [Funzionalità](#funzionalità)
- [Prerequisiti](#prerequisiti)
- [Configurazione](#configurazione)
- [Utilizzo](#utilizzo)
- [Output](#output)
- [Troubleshooting](#troubleshooting)

## Funzionalità

- `list` — elenca gli schedule di un gruppo, con filtri opzionali per prefisso del nome e per stato. La paginazione dell'API è gestita internamente: il risultato è sempre completo.
- `describe` — stampa tutti i campi di un singolo schedule (espressione, timezone, target, retry policy, DLQ, finestra flessibile, KMS key, date).
- `enable` / `disable` — cambia lo stato di **un solo schedule per invocazione**, previa conferma interattiva.

### Perché enable/disable rileggono lo schedule

`UpdateSchedule` dell'API Scheduler è una **sostituzione integrale**: ogni campo non presente nella richiesta viene riportato al valore di default di sistema. Inviare solo `{ Name, State }` azzererebbe `Description`, `Target`, `RetryPolicy`, `StartDate`, `KmsKeyArn` e il resto della configurazione.

Lo script (tramite `AWSSchedulerService` di go-common) esegue quindi sempre `GetSchedule` e rinvia tutti i campi scrivibili invariati, cambiando solo `State`. Se lo stato richiesto è già quello corrente, nessun `UpdateSchedule` viene emesso.

### Scope e blast radius

- Nessuna operazione bulk, nessuna wildcard: le mutazioni agiscono su un unico `--schedule-name`.
- Conferma interattiva obbligatoria prima di ogni mutazione, con bypass esplicito `--yes` per l'uso non interattivo.
- Nessuna scrittura su disco: l'output è solo tabellare su stdout.

## Prerequisiti

### Software Richiesto

| Software   | Versione Minima | Note                 |
| ---------- | --------------- | -------------------- |
| Node.js    | >= 22.14        | LTS consigliata      |
| pnpm       | >= 10.28        | Package manager      |
| TypeScript | >= 5.0.0        | Incluso nel progetto |

### Account e Permessi

- [ ] Accesso AWS con profilo SSO configurato
- [ ] Permessi IAM: `scheduler:ListSchedules`, `scheduler:GetSchedule`, `scheduler:UpdateSchedule`
- [ ] Per `enable`/`disable` serve anche `iam:PassRole` sul role usato dal target dello schedule, perché `UpdateSchedule` rinvia il `RoleArn` del target

### Credenziali AWS

Configurare le credenziali AWS utilizzando AWS SSO:

```bash
aws sso login --profile <nome-profilo>
```

## Configurazione

### Parametri CLI

| Parametro          | Alias | Tipo   | Obbligatorio                   | Default      | Descrizione                                                    |
| ------------------ | ----- | ------ | ------------------------------ | ------------ | -------------------------------------------------------------- |
| `--aws-profile`    | `ap`  | string | sì                             | —            | Nome del profilo AWS SSO                                       |
| `--aws-region`     | `ar`  | string | no                             | `eu-south-1` | Region che ospita gli schedule                                 |
| `--action`         | `a`   | string | sì                             | —            | Azione da eseguire: `list`, `describe`, `enable`, `disable`    |
| `--schedule-name`  | `n`   | string | sì per describe/enable/disable | —            | Nome dello schedule su cui operare                             |
| `--schedule-group` | `g`   | string | no                             | `default`    | Gruppo di schedule proprietario dello schedule                 |
| `--name-prefix`    | `p`   | string | no                             | —            | Filtro per prefisso del nome, usato solo da `list`             |
| `--state`          | `s`   | string | no                             | —            | Filtro per stato, usato solo da `list`: `ENABLED` o `DISABLED` |
| `--yes`            | `y`   | bool   | no                             | `false`      | Salta la conferma interattiva prima di `enable`/`disable`      |

### Variabili d'Ambiente

Ogni parametro è leggibile anche da variabile d'ambiente, con il nome derivato da GOScript:

| Variabile        | Descrizione           | Esempio            |
| ---------------- | --------------------- | ------------------ |
| `AWS_PROFILE`    | Profilo AWS SSO       | `sso_pn-core-prod` |
| `AWS_REGION`     | Region AWS            | `eu-south-1`       |
| `SCHEDULE_NAME`  | Nome dello schedule   | `nightly-job`      |
| `SCHEDULE_GROUP` | Gruppo dello schedule | `default`          |

### Priorità di Configurazione

1. Parametri CLI (priorità massima)
2. Variabili d'ambiente
3. File di configurazione
4. Valori di default

## Utilizzo

### Modalità Development (via pnpm/tsx)

```bash
# Dalla root del monorepo
pnpm aws:schedule:eventbridge:dev -- --action list --aws-profile <profilo>

# Oppure con filter
pnpm --filter=aws-schedule-eventbridge dev -- --action list --aws-profile <profilo>
```

### Modalità Production (build + node)

```bash
# Build
pnpm --filter=aws-schedule-eventbridge build

# Esecuzione
pnpm --filter=aws-schedule-eventbridge start -- --action list --aws-profile <profilo>
```

### Esempi Pratici

```bash
# Elenco completo degli schedule del gruppo default
pnpm aws:schedule:eventbridge:dev -- --action list --aws-profile <profilo>

# Solo gli schedule attivi di un gruppo, filtrati per prefisso
pnpm aws:schedule:eventbridge:dev -- --action list --aws-profile <profilo> \
  --schedule-group batch --name-prefix nightly --state ENABLED

# Dettaglio di uno schedule
pnpm aws:schedule:eventbridge:dev -- --action describe --aws-profile <profilo> \
  --schedule-name nightly-job

# Disabilitare uno schedule (con conferma interattiva)
pnpm aws:schedule:eventbridge:dev -- --action disable --aws-profile <profilo> \
  --schedule-name nightly-job

# Riabilitarlo senza conferma (uso non interattivo)
pnpm aws:schedule:eventbridge:dev -- --action enable --aws-profile <profilo> \
  --schedule-name nightly-job --yes
```

## Output

Tutto l'output è su stdout, in forma tabellare: non vengono prodotti file.

### `list` — tabella riassuntiva

```
+--------------------+--------+----------+------------------------------------+------------------------+
| Name               | Group  | State    | Target ARN                         | Last Modified          |
+--------------------+--------+----------+------------------------------------+------------------------+
| nightly-job        | default| ENABLED  | arn:aws:lambda:...:reconcile       | 2026-09-15T08:30:00Z   |
| weekly-cleanup     | default| DISABLED | arn:aws:lambda:...:cleanup         | 2026-08-02T12:00:00Z   |
+--------------------+--------+----------+------------------------------------+------------------------+
```

### `describe` — tabella chiave/valore

Riporta `Name`, `Group`, `State`, `ARN`, `Description`, `Schedule Expression`, `Timezone`, `Start Date`, `End Date`, la finestra flessibile, il target (ARN, role, DLQ, retry policy), `Action After Completion`, `KMS Key ARN` e le date di creazione/ultima modifica.

### `enable` / `disable` — esito della transizione

```
> AWS Schedule EventBridge
  Current State: ENABLED
  Target State:  DISABLED

? Set schedule "nightly-job" to DISABLED? (y/N)

  [OK] Schedule "nightly-job" moved from ENABLED to DISABLED.
```

Se lo stato richiesto coincide con quello attuale lo script lo segnala e termina senza emettere alcuna modifica.

## Troubleshooting

### Problemi Comuni

#### Errore: "AWS credentials not found"

**Causa**: Profilo AWS non configurato o sessione SSO scaduta.

**Soluzione**:

```bash
aws sso login --profile <nome-profilo>
```

#### Errore: `ResourceNotFoundException`

**Causa**: Lo schedule non esiste nel gruppo indicato. Il gruppo di default è `default`: uno schedule creato in un gruppo diverso va cercato con `--schedule-group`.

**Soluzione**: verificare il nome con `--action list --schedule-group <gruppo>`.

#### Errore: `Invalid action "..."`

**Causa**: Valore di `--action` non supportato.

**Soluzione**: usare uno fra `list`, `describe`, `enable`, `disable`.

#### La conferma non compare

**Causa**: `--yes` è attivo, oppure lo script gira in un contesto non interattivo.

**Soluzione**: rimuovere `--yes` per ripristinare il gate di conferma.

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

**Ultima modifica**: 2026-10-01
**Maintainer**: Team GO - Gestione Operativa
