# GO Report Alarms

> Versione: 1.0.0 | Autore: Team GO - Gestione Operativa

Script di analisi degli allarmi CloudWatch AWS per identificare e categorizzare gli allarmi che sono transitati dallo stato OK ad ALARM in un determinato periodo di tempo.

## Indice

- [Funzionalita](#funzionalita)
- [Prerequisiti](#prerequisiti)
- [Configurazione](#configurazione)
- [Utilizzo](#utilizzo)
- [Output](#output)
- [Troubleshooting](#troubleshooting)

## Funzionalita

- **Recupero storico allarmi**: Interroga AWS CloudWatch per ottenere lo storico completo delle transizioni di stato degli allarmi
- **Filtraggio intelligente**: Esclude automaticamente allarmi non rilevanti tramite pattern configurabili (regex)
- **Analisi aggregata**: Raggruppa gli allarmi per nome e conta le occorrenze
- **Timeline dettagliata**: Mostra il timestamp di ogni transizione per analisi temporale
- **Report formattato**: Output strutturato con sezioni separate per allarmi ignorati e analizzabili
- **Supporto Google Sheets**: Fornisce timestamp in formato compatibile per copia diretta in fogli di calcolo

## Prerequisiti

### Software Richiesto

| Software   | Versione Minima | Note                    |
|------------|-----------------|-------------------------|
| Node.js    | >= 18.0.0       | LTS consigliata (v24+)  |
| pnpm       | >= 8.0.0        | Package manager         |
| TypeScript | >= 5.0.0        | Incluso nel progetto    |
| AWS CLI    | >= 2.0          | Per configurazione SSO  |

### Account e Permessi AWS

- Account AWS con accesso al servizio CloudWatch
- Profilo SSO configurato con permessi:
  - `cloudwatch:DescribeAlarmHistory`
  - `cloudwatch:DescribeAlarms` (opzionale, per filtro per nome)

### Configurazione AWS SSO

```bash
# Configurare un profilo SSO (una tantum)
aws configure sso --profile sso_pn-core-prod

# Effettuare login prima dell'esecuzione
aws sso login --profile sso_pn-core-prod
```

## Configurazione

### Parametri CLI

| Parametro | Alias | Tipo | Obbligatorio | Default | Descrizione |
|-----------|-------|------|--------------|---------|-------------|
| `--start.date` | `-sd` | string | Si | - | Data inizio analisi (formato ISO 8601) |
| `--end.date` | `-ed` | string | Si | - | Data fine analisi (formato ISO 8601) |
| `--aws.profile` | `-ap` | string | Si | - | Nome profilo AWS SSO |
| `--alarm.name` | `-an` | string | No | - | Filtro per nome allarme specifico |
| `--verbose` | `-v` | boolean | No | `false` | Mostra tutti i timestamp (non solo primo/ultimo) |
| `--ignore.patterns` | `-ip` | string[] | No | Da config | Pattern da ignorare (separati da virgola) |

### Formato Date

Le date devono essere in formato **ISO 8601**:

```
YYYY-MM-DDTHH:MM:SSZ

Esempi:
- 2024-12-01T00:00:00Z
- 2024-12-15T23:59:59Z
- 2024-12-10T14:30:00+01:00
```

### File di Configurazione

Percorso: `configs/config.json`

```json
{
  "ignore": {
    "patterns": [
      "-CumulativeAlarm",
      "workday-SLAViolations-",
      "autoscaling-rest",
      "-DLQ-IncreasingMessage",
      "-DLQ-HasMessage",
      "pn-paper-channel-autoscaling-custom",
      "pn-radd-SSL-Certificate-Expiration-Alarm",
      "pn-web-logout-api-ErrorAlarm",
      "pn-jwksCacheRefreshLambda-LogInvocationErrors-Alarm",
      "redshift-interop-analytics"
    ]
  }
}
```

#### Pattern di Ignore

I pattern vengono utilizzati per escludere allarmi non rilevanti dall'analisi:

- I pattern sono **stringhe semplici** (non regex completi)
- Lo script compila automaticamente i pattern in una singola RegExp ottimizzata
- Un allarme viene ignorato se il suo nome **contiene** uno dei pattern

**Esempi di pattern**:
- `-CumulativeAlarm`: Ignora tutti gli allarmi il cui nome contiene "-CumulativeAlarm"
- `workday-`: Ignora allarmi che iniziano con "workday-"
- `-DLQ-`: Ignora allarmi relativi alle Dead Letter Queue

### Priorita di Configurazione

1. **Parametri CLI** (priorita massima)
2. **File config.json** (caricato automaticamente tramite `asyncFallback`)

## Utilizzo

### Modalita Development (via pnpm/tsx)

```bash
# Dalla root del monorepo - usando lo shortcut
pnpm go:analyze:alarms -- \
  --start.date "2024-12-01T00:00:00Z" \
  --end.date "2024-12-15T23:59:59Z" \
  --aws.profile sso_pn-core-prod

# Oppure con filter diretto
pnpm --filter=go-report-alarms dev -- \
  --start.date "2024-12-01T00:00:00Z" \
  --end.date "2024-12-15T23:59:59Z" \
  --aws.profile sso_pn-core-prod
```

### Modalita Production (build + node)

```bash
# Build
pnpm --filter=go-report-alarms build

# Esecuzione
pnpm --filter=go-report-alarms start -- \
  --start.date "2024-12-01T00:00:00Z" \
  --end.date "2024-12-15T23:59:59Z" \
  --aws.profile sso_pn-core-prod

# Oppure usando lo shortcut production
pnpm go:analyze:alarms:prod -- \
  --start.date "2024-12-01T00:00:00Z" \
  --end.date "2024-12-15T23:59:59Z" \
  --aws.profile sso_pn-core-prod
```

### Modalita Standalone

```bash
# Dalla directory dello script
cd scripts/go/go-report-alarms

# Esecuzione diretta
node dist/index.js \
  --start.date "2024-12-01T00:00:00Z" \
  --end.date "2024-12-15T23:59:59Z" \
  --aws.profile sso_pn-core-prod
```

### Esempi Pratici

```bash
# Analisi ultima settimana
pnpm go:analyze:alarms -- \
  --start.date "2024-12-08T00:00:00Z" \
  --end.date "2024-12-15T23:59:59Z" \
  --aws.profile sso_pn-core-prod

# Analisi con output verbose (tutti i timestamp)
pnpm go:analyze:alarms -- \
  --start.date "2024-12-01T00:00:00Z" \
  --end.date "2024-12-15T23:59:59Z" \
  --aws.profile sso_pn-core-prod \
  --verbose

# Analisi di un allarme specifico
pnpm go:analyze:alarms -- \
  --start.date "2024-12-01T00:00:00Z" \
  --end.date "2024-12-15T23:59:59Z" \
  --aws.profile sso_pn-core-prod \
  --alarm.name "pn-delivery-push-ErrorAlarm"

# Override dei pattern di ignore da CLI
pnpm go:analyze:alarms -- \
  --start.date "2024-12-01T00:00:00Z" \
  --end.date "2024-12-15T23:59:59Z" \
  --aws.profile sso_pn-core-prod \
  --ignore.patterns "-test-,-sandbox-,-dev-"

# Usando alias brevi
pnpm go:analyze:alarms -- \
  -sd "2024-12-01T00:00:00Z" \
  -ed "2024-12-15T23:59:59Z" \
  -ap sso_pn-core-prod \
  -v
```

## Output

### Report Console

Lo script genera un output strutturato in sezioni:

```
╭─────────────────────────────────────────╮
│  GO Report Alarms v1.0.0                │
│  Team GO - Gestione Operativa           │
╰─────────────────────────────────────────╯

► Fetching Alarm History
  Retrieving alarm history from AWS CloudWatch...
  ✓ Retrieved 1523 alarm history items

► Ignored Alarms Report
  [15] pn-delivery-CumulativeAlarm-prod
  [8] workday-SLAViolations-critical
  [23] pn-external-channel-DLQ-HasMessage
  Total Ignored: 46

► Analyzable Alarms Report
  [12] pn-delivery-push-ErrorAlarm
  [5] pn-paper-channel-TimeoutAlarm
  [3] pn-user-attributes-HighLatency
  Total Analyzable: 20

► Analyzable Alarms Details
  [12] pn-delivery-push-ErrorAlarm
   - First: 2024-12-01T08:15:30.000Z - (01/12/2024 09:15:30)
   - Last:  2024-12-14T22:45:12.000Z - (14/12/2024 23:45:12)

  [5] pn-paper-channel-TimeoutAlarm
   - First: 2024-12-03T14:20:00.000Z - (03/12/2024 15:20:00)
   - Last:  2024-12-10T16:30:45.000Z - (10/12/2024 17:30:45)

  [3] pn-user-attributes-HighLatency
    - 2024-12-05T09:00:00.000Z - (05/12/2024 10:00:00)
    - 2024-12-07T11:30:00.000Z - (07/12/2024 12:30:00)
    - 2024-12-12T15:45:00.000Z - (12/12/2024 16:45:00)
```

### Formato Timestamp

I timestamp sono mostrati in due formati:
1. **ISO 8601**: `2024-12-01T08:15:30.000Z` (UTC)
2. **Google Sheets**: `01/12/2024 09:15:30` (Europe/Rome, formato dd/MM/yyyy HH:mm:ss)

Il formato Google Sheets e ottimizzato per il copia-incolla diretto in fogli di calcolo.

### Modalita Verbose vs Compatta

**Modalita Compatta** (default): Per allarmi con piu di 2 occorrenze, mostra solo primo e ultimo timestamp.

**Modalita Verbose** (`--verbose`): Mostra tutti i timestamp per ogni allarme.

### Log Files

I log vengono salvati automaticamente in:
```
logs/go-report-alarms_YYYY-MM-DD.log
```

## Troubleshooting

### Problemi Comuni

#### Errore: "AWS credentials not found" / "ExpiredToken"

**Causa**: Sessione AWS SSO scaduta o profilo non configurato.

**Soluzione**:
```bash
# Verificare il profilo
aws configure list --profile sso_pn-core-prod

# Effettuare login SSO
aws sso login --profile sso_pn-core-prod

# Verificare che la sessione sia attiva
aws sts get-caller-identity --profile sso_pn-core-prod
```

#### Errore: "Invalid start date" / "Invalid end date"

**Causa**: Formato data non valido.

**Soluzione**: Usare formato ISO 8601 completo:
```bash
# Corretto
--start.date "2024-12-01T00:00:00Z"

# Errato
--start.date "2024-12-01"
--start.date "01/12/2024"
```

#### Errore: "Start date must be before end date"

**Causa**: La data di inizio e successiva alla data di fine.

**Soluzione**: Verificare l'ordine delle date nei parametri.

#### Errore: "Cannot find module '@go-automation/go-common'"

**Causa**: La libreria comune non e stata compilata.

**Soluzione**:
```bash
# Dalla root del monorepo
pnpm build:common
pnpm --filter=go-report-alarms build
```

#### Nessun Allarme Trovato

**Causa possibili**:
1. Nessuna transizione OK->ALARM nel periodo specificato
2. Tutti gli allarmi sono stati filtrati dai pattern di ignore
3. Range temporale troppo ristretto

**Soluzione**:
- Ampliare il range di date
- Verificare i pattern di ignore in `configs/config.json`
- Usare `--alarm.name` per verificare un allarme specifico

### Debug Mode

```bash
# Eseguire con output di debug
DEBUG=* pnpm go:analyze:alarms -- \
  --start.date "2024-12-01T00:00:00Z" \
  --end.date "2024-12-15T23:59:59Z" \
  --aws.profile sso_pn-core-prod

# Verificare type errors
pnpm --filter=go-report-alarms exec tsc --noEmit
```

---

**Ultima modifica**: 2025-01-23
**Maintainer**: Team GO - Gestione Operativa
**Repository**: [go-automation](https://github.com/pagopa/go-automation)
