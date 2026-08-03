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

| Software | Versione Minima | Note |
|----------|-----------------|------|
| Node.js  | >= 18.0.0       | LTS consigliata |
| pnpm     | >= 8.0.0        | Package manager |
| TypeScript | >= 5.0.0      | Incluso nel progetto |

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

| Parametro | Alias | Tipo | Obbligatorio | Default | Descrizione |
|-----------|-------|------|--------------|---------|-------------|
| `--configFile` | | Stringa | Sì | | Percorso del file JSON contenente la configurazione dei cluster e delle regole |
| `--awsProfiles` | | Array / Stringa | Sì | | Lista dei profili AWS da elaborare (es. `--awsProfiles profile1 profile2`) |

### Variabili d'Ambiente

| Variabile | Descrizione | Esempio |
|-----------|-------------|---------|
| `CONFIG_FILE` | Percorso del file JSON di configurazione | `configs/config.json` |
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
    "rules": ["rule-1", "rule-2"]
  }
]
```

### Priorità di Configurazione

1. Parametri CLI (priorità massima)
2. Variabili d'ambiente
3. File di configurazione
4. Valori di default

## Utilizzo

### Modalità Development (via pnpm/tsx)

```bash
# Dalla root del monorepo
pnpm send:fetch:ecs:clusters:infos:dev

# Oppure con filter
pnpm --filter=send-fetch-ecs-clusters-infos dev

# Con parametri
pnpm send:fetch:ecs:clusters:infos:dev -- --configFile configs/config.json --awsProfiles profile1
```

### Modalità Production (build + node)

```bash
# Build
pnpm --filter=send-fetch-ecs-clusters-infos build

# Esecuzione
pnpm --filter=send-fetch-ecs-clusters-infos start

# Oppure direttamente
node dist/index.js --configFile configs/config.json --awsProfiles profile1
```

### Esempi Pratici

```bash
# Esempio 1: Caso d'uso comune
pnpm send:fetch:ecs:clusters:infos:dev -- --configFile configs/config.json --awsProfiles uat-profile

# Esempio 2: Esecuzione di produzione diretta
node dist/index.js --configFile configs/config.json --awsProfiles prod-profile
```

## Output

### Formato Report

Descrivere il formato dell'output generato:

- **Log**: `<monorepo path>/data/send-fetch-ecs-clusters-infos/send-fetch-ecs-clusters-infos_<ISO8610 timestamp>/execution.log`

### Esempio Output Console

```
...
⏵ Starting send-fetch-ecs-clusters-infos

⏵ AWS Profile profile1 (env1)
    ℹ Clusters state
    - cluster1: ACTIVE (PendingTasks: 0, RunningTasks: 14)
    - cluster2: ACTIVE (PendingTasks: 0, RunningTasks: 23)

    ℹ Scheduled actions
    - RuleName1 (ENABLED) - cron(0 6 ? * MON-FRI *) Europe/Rome
    - RuleName2 (ENABLED) - cron(0 20 ? * MON-FRI *) Europe/Rome

⏵ AWS Profile profile2 (env2)
...
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
pnpm --filter=send-fetch-ecs-clusters-infos build
```

#### Errore: "Invalid date format"

**Causa**: Formato data non valido.

**Soluzione**: Usare formato ISO 8601: `YYYY-MM-DDTHH:MM:SSZ`

### Debug Mode

```bash
# Eseguire con debug output
DEBUG=* pnpm send:fetch:ecs:clusters:infos:dev

# Type check senza build
pnpm --filter=send-fetch-ecs-clusters-infos exec tsc --noEmit
```

---

**Ultima modifica**: 2026-07-29
**Maintainer**: Team GO - Gestione Operativa

