# SEND Monitor TPP Messages

> Versione: 2.0.0 | Autore: Team GO - Gestione Operativa

Script di monitoraggio messaggi TPP (Third Party Provider) tramite query Athena con generazione report CSV e notifiche Slack opzionali.

## Indice

- [Funzionalità](#funzionalità)
- [Prerequisiti](#prerequisiti)
- [Configurazione](#configurazione)
- [Utilizzo](#utilizzo)
- [Output](#output)
- [Scheduling](#scheduling)
- [Troubleshooting](#troubleshooting)

## Funzionalità

- **Query Athena ottimizzate**: Esegue query su tabelle partizionate per ora con filtri su partizioni (alta performance)
- **Report CSV automatici**: Genera file CSV con timestamp e conteggio notifiche TPP per fascia oraria
- **Notifiche Slack**: Invia report automatici su canale Slack con analisi preliminare
- **Analisi a soglia**: Identifica automaticamente fasce orarie che superano una soglia configurabile
- **Scheduling integrato**: Supporto per esecuzione schedulata via cron interno (croner)
- **Range temporali flessibili**: Supporta date ISO 8601, date semplici e Unix timestamp

## Prerequisiti

### Software Richiesto

| Software   | Versione Minima | Note                   |
| ---------- | --------------- | ---------------------- |
| Node.js    | >= 18.0.0       | LTS consigliata (v24+) |
| pnpm       | >= 8.0.0        | Package manager        |
| TypeScript | >= 5.0.0        | Incluso nel progetto   |
| AWS CLI    | >= 2.0          | Per configurazione SSO |

### Account e Permessi AWS

- Account AWS con accesso ad Athena
- Profilo SSO configurato con permessi:
  - `athena:StartQueryExecution`
  - `athena:GetQueryExecution`
  - `athena:GetQueryResults`
  - `s3:PutObject` (per output location)
  - `s3:GetObject` (per leggere risultati)
  - `glue:GetTable` (per accesso catalogo)

### Accesso Dati

- Database Athena con tabella `pn_timelines_json_view`
- Tabella partizionata per anno, mese, giorno, ora (`p_year`, `p_month`, `p_day`, `p_hour`)

### Slack (Opzionale)

- Bot Slack con token OAuth
- Permessi: `chat:write`, `files:write`
- Bot aggiunto al canale target

## Configurazione

### Parametri CLI

#### Date Range

| Parametro | Alias | Tipo   | Obbligatorio | Default      | Descrizione     |
| --------- | ----- | ------ | ------------ | ------------ | --------------- |
| `--from`  | `-f`  | string | No           | 24 ore fa    | Data/ora inizio |
| `--to`    | `-t`  | string | No           | Ora corrente | Data/ora fine   |

#### AWS

| Parametro       | Alias | Tipo   | Obbligatorio | Default      | Descrizione     |
| --------------- | ----- | ------ | ------------ | ------------ | --------------- |
| `--aws.profile` | `-ap` | string | Si           | -            | Profilo AWS SSO |
| `--aws.region`  | `-ar` | string | No           | `eu-south-1` | Regione AWS     |

#### Athena

| Parametro                  | Alias  | Tipo   | Obbligatorio | Default          | Descrizione                                                         |
| -------------------------- | ------ | ------ | ------------ | ---------------- | ------------------------------------------------------------------- |
| `--athena.database`        | `-ad`  | string | Si           | -                | Database Athena                                                     |
| `--athena.catalog`         | `-ac`  | string | No           | `AwsDataCatalog` | Data catalog                                                        |
| `--athena.workgroup`       | `-aw`  | string | No           | `primary`        | Workgroup Athena                                                    |
| `--athena.output.location` | `-ao`  | string | Si           | -                | S3 path per output                                                  |
| `--athena.max.retries`     | `-amr` | int    | No           | `60`             | Tentativi max polling                                               |
| `--athena.retry.delay`     | `-ard` | int    | No           | `5000`           | Delay polling (ms)                                                  |
| `--athena.query`           | `-aq`  | string | Si           | -                | Template SQL con placeholder per il range temporale e le partizioni |

> `athena.query` può essere passato da CLI, ma nella pratica e quasi sempre più comodo definirlo in `config.yaml`.

#### Slack (Opzionale)

| Parametro                  | Alias  | Tipo   | Obbligatorio | Default   | Descrizione        |
| -------------------------- | ------ | ------ | ------------ | --------- | ------------------ |
| `--slack.token`            | `-st`  | string | No           | -         | Token bot Slack    |
| `--slack.channel`          | `-sc`  | string | No           | -         | Canale Slack       |
| `--slack.message.template` | `-smt` | string | No           | Da config | Template messaggio |

#### Analisi

| Parametro                    | Alias  | Tipo   | Obbligatorio | Default | Descrizione              |
| ---------------------------- | ------ | ------ | ------------ | ------- | ------------------------ |
| `--analysis.threshold.field` | `-atf` | string | No           | -       | Campo per analisi soglia |
| `--analysis.threshold`       | `-at`  | int    | No           | `0`     | Valore soglia            |

#### Output

| Parametro          | Alias | Tipo   | Obbligatorio | Default   | Descrizione         |
| ------------------ | ----- | ------ | ------------ | --------- | ------------------- |
| `--reports.folder` | `-rf` | string | No           | `reports` | Cartella output CSV |

### Formati Data Supportati

```bash
# ISO 8601 completo
--from "2024-12-01T10:30:00Z"

# Solo data (assume 00:00:00)
--from "2024-12-01"

# Unix timestamp (secondi)
--from "1704067200"
```

### File di Configurazione

Percorso: `configs/config.yaml`

```yaml
# Configurazione AWS
aws:
  profile: sso_pn-core-prod
  environment: prod
  region: eu-south-1

# Configurazione Athena
athena:
  database: pn_analytics
  catalog: AwsDataCatalog
  workGroup: primary
  outputLocation: s3://pn-athena-results/tpp-monitor/
  maxRetries: 60
  retryDelay: 10000

  # Query SQL (con placeholder)
  query: |
    WITH interesting_timelines AS (
      SELECT
        timelineElementId,
        date_trunc('hour', at_timezone(from_iso8601_timestamp(timestamp), 'Europe/Rome')) as ora_invio
      FROM
        pn_timelines_json_view
      WHERE
        timelineElementId LIKE '%TPP%'
        AND CONCAT(p_year, p_month, p_day, p_hour) >= '{{startYear}}{{startMonth}}{{startDay}}{{startHour}}'
        AND CONCAT(p_year, p_month, p_day, p_hour) <= '{{endYear}}{{endMonth}}{{endDay}}{{endHour}}'
    )
    SELECT
      ora_invio,
      count(*) as notifiche_tpp
    FROM
      interesting_timelines
    GROUP BY
      ora_invio
    ORDER BY
      ora_invio

# Configurazione Slack
slack:
  token: xoxb-your-token-here
  channel: C1234567890
  messageTemplate: |
    *Report TPP Messages*

    *Periodo analizzato:*
    - Da: {{startDate}}
    - A: {{endDate}}

    *Risultati:*
    - Righe totali: {{rowCount}}
    - File generato: `{{fileName}}`

    *Analisi preliminare:*
    {{analysis}}

    _Report generato il {{timestamp}}_

# Configurazione analisi
analysis:
  thresholdField: notifiche_tpp
  threshold: 100

# Output
output:
  reportsFolder: reports
```

### Placeholder Query

La query SQL supporta i seguenti placeholder:

| Placeholder      | Descrizione                       | Esempio               |
| ---------------- | --------------------------------- | --------------------- |
| `{{startDate}}`  | Data inizio (YYYY-MM-DD HH:MI:SS) | `2024-12-01 10:30:00` |
| `{{endDate}}`    | Data fine (YYYY-MM-DD HH:MI:SS)   | `2024-12-15 18:00:00` |
| `{{startYear}}`  | Anno inizio (YYYY)                | `2024`                |
| `{{startMonth}}` | Mese inizio (MM)                  | `12`                  |
| `{{startDay}}`   | Giorno inizio (DD)                | `01`                  |
| `{{startHour}}`  | Ora inizio (HH)                   | `10`                  |
| `{{endYear}}`    | Anno fine (YYYY)                  | `2024`                |
| `{{endMonth}}`   | Mese fine (MM)                    | `12`                  |
| `{{endDay}}`     | Giorno fine (DD)                  | `15`                  |
| `{{endHour}}`    | Ora fine (HH)                     | `18`                  |

### Placeholder Messaggio Slack

| Placeholder     | Descrizione             |
| --------------- | ----------------------- |
| `{{startDate}}` | Data inizio query (ISO) |
| `{{endDate}}`   | Data fine query (ISO)   |
| `{{rowCount}}`  | Numero righe risultato  |
| `{{fileName}}`  | Nome file CSV           |
| `{{analysis}}`  | Testo analisi soglia    |
| `{{timestamp}}` | Timestamp generazione   |

### Priorita di Configurazione

1. **Parametri CLI** (priorita massima)
2. **Variabili d'ambiente**
3. **File config.yaml**
4. **Valori di default**

## Utilizzo

### Modalità Development (via pnpm/tsx)

```bash
# Dalla root del monorepo
# Ultime 24 ore (default)
pnpm --filter=send-monitor-tpp-messages dev

# Con range specifico
pnpm --filter=send-monitor-tpp-messages dev -- \
  --from "2024-12-01" \
  --to "2024-12-15" \
  --aws.profile sso_pn-core-prod \
  --athena.database pn_analytics \
  --athena.output.location "s3://my-bucket/results/"
```

### Modalità Production (build + node)

```bash
# Build
pnpm --filter=send-monitor-tpp-messages build

# Esecuzione
pnpm --filter=send-monitor-tpp-messages start -- \
  --from "2024-12-01" \
  --to "2024-12-15" \
  --aws.profile sso_pn-core-prod \
  --athena.database pn_analytics \
  --athena.output.location "s3://my-bucket/results/"
```

### Modalità Standalone

```bash
# Dalla directory dello script
cd scripts/send/send-monitor-tpp-messages

# Esecuzione diretta
node dist/index.js \
  --from "2024-12-01" \
  --aws.profile sso_pn-core-prod \
  --athena.database pn_analytics \
  --athena.output.location "s3://my-bucket/results/"
```

### Esempi Pratici

```bash
# Ultime 24 ore con notifica Slack
pnpm --filter=send-monitor-tpp-messages dev -- \
  --aws.profile sso_pn-core-prod \
  --athena.database pn_analytics \
  --athena.output.location "s3://bucket/results/" \
  --slack.token "xoxb-your-token" \
  --slack.channel "C1234567890"

# Report giornaliero con soglia
pnpm --filter=send-monitor-tpp-messages dev -- \
  --from "$(date +%Y-%m-%d)" \
  --aws.profile sso_pn-core-prod \
  --athena.database pn_analytics \
  --athena.output.location "s3://bucket/results/" \
  --analysis.threshold.field "notifiche_tpp" \
  --analysis.threshold 100

# Report con range orario specifico
pnpm --filter=send-monitor-tpp-messages dev -- \
  --from "2024-12-15T08:00:00Z" \
  --to "2024-12-15T18:00:00Z" \
  --aws.profile sso_pn-core-prod \
  --athena.database pn_analytics \
  --athena.output.location "s3://bucket/results/"

# Con variabili d'ambiente
AWS_PROFILE=sso_pn-core-prod \
ATHENA_DATABASE=pn_analytics \
ATHENA_OUTPUT_LOCATION="s3://bucket/results/" \
SLACK_TOKEN="xoxb-token" \
SLACK_CHANNEL="C1234567890" \
pnpm --filter=send-monitor-tpp-messages dev
```

## Output

### File CSV

I file vengono salvati in `reports/` con naming:

```
report_YYYY-MM-DD_HH-MM-SS.csv
```

**Formato colonne**:

```csv
ora_invio,notifiche_tpp
"2024-12-15 09:00:00",1234
"2024-12-15 10:00:00",1567
"2024-12-15 11:00:00",1823
```

### Notifica Slack

Esempio messaggio con template default:

```
*Report TPP Messages*

*Periodo analizzato:*
- Da: 2024-12-15T00:00:00.000Z
- A: 2024-12-15T23:59:59.999Z

*Risultati:*
- Righe totali: 24
- File generato: `report_2024-12-15_14-30-00.csv`

*Analisi preliminare:*
Fasce orarie sopra soglia (100):
- 2024-12-15 09:00:00: 1234
- 2024-12-15 14:00:00: 1567
- 2024-12-15 15:00:00: 1823

_Report generato il 2024-12-15T14:30:00.000Z_
```

Se configurato, il file CSV viene allegato al messaggio.

### Analisi a Soglia

Con `--analysis.threshold.field` e `--analysis.threshold` configurati:

```
Fasce orarie sopra soglia (100):
- 2024-12-15 09:00:00: 1234 notifiche
- 2024-12-15 14:00:00: 1567 notifiche
- 2024-12-15 15:00:00: 1823 notifiche
```

### Report Console

```
╭─────────────────────────────────────────────╮
│  SEND Monitor TPP Messages v2.0.0           │
│  Team GO - Gestione Operativa               │
╰─────────────────────────────────────────────╯

► Time Range
  From: 2024-12-15T00:00:00.000Z
  To: 2024-12-15T23:59:59.999Z

► Initializing AWS Athena

► Initializing Slack
  Slack connection verified

► Loading Query Template
  Query template loaded from config.yaml

► Executing Athena Query
  Running query...
  ✓ Query completed

► Processing Results
  Total rows: 24
  Analysis: Fasce orarie sopra soglia (100): 3
  CSV saved to: reports/report_2024-12-15_14-30-00.csv

► Execution Summary
  CSV report: reports/report_2024-12-15_14-30-00.csv
  Total rows: 24
  Slack notification: SENT
```

## Scheduling

### Cron Integrato

Lo script include un scheduler cron integrato basato su `croner`:

```bash
# Avviare lo scheduler
CRON_SCHEDULE="0 9 * * *" pnpm --filter=send-monitor-tpp-messages start:cron
```

**Variabili ambiente per cron**:

| Variabile       | Descrizione                     | Esempio       |
| --------------- | ------------------------------- | ------------- |
| `CRON_SCHEDULE` | Espressione cron (obbligatoria) | `0 9 * * *`   |
| `TZ`            | Timezone                        | `Europe/Rome` |

**Esempi schedule**:

- `0 9 * * *` - Ogni giorno alle 9:00
- `0 */6 * * *` - Ogni 6 ore
- `0 9 * * 1-5` - Giorni feriali alle 9:00

### Output Scheduler

```
=== GO Automation Cron Scheduler ===
Schedule: 0 9 * * *
Timezone: Europe/Rome
Started: 2024-12-15T08:00:00.000Z

Next run: 2024-12-15T09:00:00.000Z
Waiting for scheduled runs...
-----------------------------------

[2024-12-15T09:00:00.000Z] Starting scheduled job...
... (output normale dello script)
[2024-12-15T09:05:30.000Z] Job completed successfully
```

### Integrazione con Cron di Sistema

In alternativa allo scheduler integrato:

```bash
# crontab -e
# Esegui ogni giorno alle 9:00
0 9 * * * cd /path/to/go-automation && pnpm --filter=send-monitor-tpp-messages start >> /var/log/tpp-monitor.log 2>&1
```

## Troubleshooting

### Problemi Comuni

#### Errore: "Query execution failed"

**Causa**: Errore nella query SQL o permessi insufficienti.

**Soluzione**:

1. Verificare la sintassi SQL in `config.yaml`
2. Testare la query direttamente nella console Athena
3. Verificare permessi IAM su database e tabelle

#### Errore: "Query timeout"

**Causa**: Query troppo lenta o `maxRetries` troppo basso.

**Soluzione**:

```bash
# Aumentare timeout
--athena.max.retries 120 --athena.retry.delay 10000
```

Tempo max = `maxRetries * retryDelay / 1000` secondi

#### Errore: "Slack authentication failed"

**Causa**: Token Slack non valido o bot non configurato.

**Soluzione**:

1. Verificare il token inizia con `xoxb-`
2. Verificare che il bot sia nel canale target
3. Verificare permessi: `chat:write`, `files:write`

#### Errore: "No data found in time range"

**Causa**: Nessun dato nel periodo specificato.

**Soluzione**:

- Ampliare il range di date
- Verificare che la tabella contenga dati TPP
- Controllare i filtri nella query

#### Errore: "AWS credentials not found"

**Causa**: Sessione SSO scaduta.

**Soluzione**:

```bash
aws sso login --profile sso_pn-core-prod
```

### Debug Query

Per debuggare la query generata:

1. Aggiungere log in `main.ts`:

```typescript
script.logger.info(`Query: ${queryTemplate}`);
script.logger.info(`Params: ${JSON.stringify(queryParams)}`);
```

2. Eseguire la query nella console Athena AWS

### Verifica Configurazione

```bash
# Mostra configurazione risolta
DEBUG=* pnpm --filter=send-monitor-tpp-messages dev -- \
  --from "2024-12-01" \
  --aws.profile test
```

---

**Ultima modifica**: 2026-04-10
**Maintainer**: Team GO - Gestione Operativa
**Repository**: [go-automation](https://github.com/pagopa/go-automation)
