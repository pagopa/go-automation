# Send Fetch Ecs Clusters Infos

> Versione: 1.0.0 | Autore: Team GO - Gestione Operativa

Per ogni ambiente e cluster configurato, questo script recupera lo stato di operatività dei cluster ECS (determinando se sono ACTIVE o NOT ACTIVE in base al conteggio dei task pendenti e in esecuzione) ed estrae i dettagli delle regole di schedulazione configurate (stato, espressione e timezone).

## Indice

- [Funzionalità](#funzionalità)
- [Prerequisiti](#prerequisiti)
- [Configurazione](#configurazione)
- [Utilizzo](#utilizzo)
- [Output](#output)
- [Troubleshooting](#troubleshooting)

## Funzionalità

Elenco delle funzionalità principali:

- **Monitoraggio Cluster ECS**: Recupero del numero di task pendenti (`pendingTasksCount`) e in esecuzione (`runningTasksCount`) per verificare se ciascun cluster è `ACTIVE` o `NOT ACTIVE`.
- **Dettagli Schedulazioni AWS Scheduler**: Interrogazione dettagliata dello stato, dell'espressione temporale (`ScheduleExpression`) e della timezone per ciascuna regola configurata.
- **Filtro Profili AWS**: Esecuzione mirata solo per un sottoinsieme di profili AWS specificati tramite configurazione.

## Prerequisiti

### Software Richiesto

| Software   | Versione Minima | Note                 |
| ---------- | --------------- | -------------------- |
| Node.js    | >= 22.14.0      | LTS consigliata      |
| pnpm       | >= 10.28.0      | Package manager      |
| TypeScript | >= 5.0.0        | Incluso nel progetto |

### Account e Permessi

- [x] Accesso AWS con profilo SSO configurato
- [x] Permessi IAM necessari:
  - `ecs:DescribeClusters` sul cluster ECS di riferimento
  - `scheduler:GetSchedule` per il recupero delle regole scheduler di EventBridge

### Credenziali AWS

Configurare le credenziali AWS utilizzando AWS SSO:

```bash
aws sso login --profile <nome-profilo>
```

## Configurazione

### Parametri CLI

| Parametro        | Alias | Tipo            | Obbligatorio | Default | Descrizione                                                                    |
| ---------------- | ----- | --------------- | ------------ | ------- | ------------------------------------------------------------------------------ |
| `--config-file`  |       | Stringa         | Sì           |         | Percorso del file JSON contenente la configurazione dei cluster e delle regole |
| `--aws-profiles` |       | Array / Stringa | Sì           |         | Lista dei profili AWS da elaborare (es. `--aws-profiles profile1 profile2`)    |

### Variabili d'Ambiente

| Variabile      | Descrizione                                    | Esempio               |
| -------------- | ---------------------------------------------- | --------------------- |
| `CONFIG_FILE`  | Percorso del file JSON di configurazione       | `configs/config.json` |
| `AWS_PROFILES` | Profili AWS da elaborare (separati da virgola) | `profile-1,profile-2` |

### File di Configurazione

#### 1. Configurazione del Script (`configs/config.json`)

Questo file descrive i cluster e le regole da monitorare per ciascun profilo/ambiente.

```json
[
  {
    "profile": "profile-1",
    "env": "production",
    "clusters": ["cluster-a", "cluster-b"],
    "rules": ["rule-1", "rule-2"],
    "ssmParameters": ["param1", "param2"]
  }
]
```

Nota: il campo ssmParameters è opzionale e può essere omesso o dichiarato come array vuoto [].

### Priorità di Configurazione

1. Parametri CLI (priorità massima)
2. Variabili d'ambiente
3. File di configurazione
4. Valori di default

## Utilizzo

### Modalità Development (via pnpm/tsx)

```bash
# Da qualsiasi folder nel monorepo
pnpm -w aws:fetch:ecs:clusters:infos:dev --config-file ./configs/<file.json> --aws-profiles <profile1>,...,<profileN>

```

### Modalità Production (build + node)

```bash
# Build
pnpm --filter=aws-fetch-ecs-clusters-infos build

# Esecuzione
pnpm --filter=aws-fetch-ecs-clusters-infos start --config-file ./configs/<file.json> --aws-profiles <profile1>,...,<profileN>

# Oppure direttamente
node dist/index.js --config-file ./configs/<file.json> --aws-profiles <profile1>,...,<profileN>
```

### Esempi Pratici

```bash
# Esempio 1: Caso d'uso comune
pnpm -w aws:fetch:ecs:clusters:infos:dev --config-file ./configs/<file.json> --aws-profiles <profile1>,...,<profileN>

# Esempio 2: Esecuzione di produzione diretta
node dist/index.js --config-file ./configs/<file.json> --aws-profiles <profile1>,...,<profileN>
```

## Output

### Formato Report

Descrivere il formato dell'output generato:

- **Log**: `<monorepo path>/data/aws-fetch-ecs-clusters-infos/aws-fetch-ecs-clusters-infos_<ISO8610 timestamp>/execution.log`

### Esempio Output Console

```
...
⏵ Starting send-fetch-ecs-clusters-infos

⏵ AWS Profile aws_profile (env)

    ℹ Clusters state
    ┌─────────────────────────────┬────────┬───────────────────┬───────────────────┐
    │ ClusterName                 │ Status │ PendingTasksCount │ RunningTasksCount │
    ├─────────────────────────────┼────────┼───────────────────┼───────────────────┤
    │ cluster1                    │ ACTIVE │ 0                 │ 16                │
    ├─────────────────────────────┼────────┼───────────────────┼───────────────────┤
    │ cluster2                    │ ACTIVE │ 0                 │ 3                 │
    └─────────────────────────────┴────────┴───────────────────┴───────────────────┘

    ℹ Scheduled actions
    ┌─────────────────────────────────┬──────────┬─────────────────────────┬─────────────┐
    │ RuleName                        │ State    │ Expression              │ Timezone    │
    ├─────────────────────────────────┼──────────┼─────────────────────────┼─────────────┤
    │ rule1                           │ DISABLED │ cron(0 20 ? * * *)      │ Europe/Rome │
    ├─────────────────────────────────┼──────────┼─────────────────────────┼─────────────┤
    │ rule1                           │ DISABLED │ cron(0 6 ? * MON-FRI *) │ Europe/Rome │
    └─────────────────────────────────┴──────────┴─────────────────────────┴─────────────┘

    ℹ Useful SSM parameter key/value
    ┌──────────────────────────────────┬───────┐
    │ Name                             │ Value │
    ├──────────────────────────────────┼───────┤
    │ param1                           │ value │
    └──────────────────────────────────┴───────┘

```

## Troubleshooting

### Problemi Comuni

#### Errore: "AWS credentials not found"

**Causa**: Profilo AWS non configurato o sessione SSO scaduta.

**Soluzione**:

```bash
# Effettuare login SSO
aws sso login --profile <nome-profilo>
```

#### Errore: "Module not found"

**Causa**: Dipendenze non installate o build non eseguito.

**Soluzione**:

```bash
pnpm install
pnpm build:common
pnpm --filter=aws-fetch-ecs-clusters-infos build
```

#### Errore: "Invalid date format"

**Causa**: Formato data non valido.

**Soluzione**: Usare formato ISO 8601: `YYYY-MM-DDTHH:MM:SSZ`

### Debug Mode

```bash
# Eseguire con debug output
DEBUG=* pnpm aws:fetch:ecs:clusters:infos:dev

# Type check senza build
pnpm --filter=aws-fetch-ecs-clusters-infos exec tsc --noEmit
```

---

**Ultima modifica**: 2026-07-29
**Maintainer**: Team GO - Gestione Operativa
