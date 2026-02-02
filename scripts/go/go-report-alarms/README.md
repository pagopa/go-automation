# GO Report Alarms

> Versione: 1.2.0 | Autore: Team GO - Gestione Operativa

Script di analisi degli allarmi CloudWatch AWS per identificare e categorizzare gli allarmi che sono transitati dallo stato OK ad ALARM in un determinato periodo di tempo. Supporta interrogazione multi-account in parallelo.

## Indice

- [Funzionalita](#funzionalita)
- [Prerequisiti](#prerequisiti)
- [Configurazione](#configurazione)
- [Utilizzo](#utilizzo)
- [Output](#output)
- [Troubleshooting](#troubleshooting)

## Funzionalita

- **Recupero storico allarmi**: Interroga AWS CloudWatch per ottenere lo storico completo delle transizioni di stato
- **Multi-account parallelo**: Interroga simultaneamente piu account AWS aggregando i risultati
- **Filtraggio intelligente**: Esclude automaticamente allarmi non rilevanti tramite pattern configurabili
- **Analisi aggregata**: Raggruppa gli allarmi per nome e conta le occorrenze
- **Timeline dettagliata**: Mostra il timestamp di ogni transizione per analisi temporale
- **Report formattato**: Output strutturato con sezioni separate per allarmi ignorati e analizzabili
- **Supporto Google Sheets**: Fornisce timestamp in formato compatibile per copia diretta in fogli di calcolo

## Prerequisiti

### Software Richiesto

| Software   | Versione Minima | Note                   |
| ---------- | --------------- | ---------------------- |
| Node.js    | >= 24.0.0       | LTS consigliata (v24+) |
| pnpm       | >= 10.0.0       | Package manager        |
| TypeScript | >= 5.9.0        | Incluso nel progetto   |
| AWS CLI    | >= 2.0          | Per configurazione SSO |

### Account e Permessi AWS

- Account AWS con accesso al servizio CloudWatch
- Profili SSO configurati con permessi:
  - `cloudwatch:DescribeAlarmHistory`
  - `cloudwatch:DescribeAlarms` (opzionale, per filtro per nome)

### Configurazione AWS SSO

```bash
# Configurare profili SSO (una tantum per ogni account)
aws configure sso --profile sso_pn-core-prod
aws configure sso --profile sso_pn-confinfo-prod

# Il login SSO viene gestito automaticamente da GOScript
# Se necessario, login manuale:
aws sso login --profile sso_pn-core-prod
```

## Configurazione

### Parametri CLI

| Parametro           | Alias  | Tipo     | Obbligatorio | Default   | Descrizione                                      |
| ------------------- | ------ | -------- | ------------ | --------- | ------------------------------------------------ |
| `--start-date`      | `-sd`  | string   | Si           | -         | Data inizio analisi (formato ISO 8601)           |
| `--end-date`        | `-ed`  | string   | Si           | -         | Data fine analisi (formato ISO 8601)             |
| `--aws-profiles`    | `-aps` | string[] | Si           | -         | Profili AWS SSO (separati da virgola)            |
| `--alarm-name`      | `-an`  | string   | No           | -         | Filtro per nome allarme specifico                |
| `--verbose`         | `-v`   | boolean  | No           | `false`   | Mostra tutti i timestamp (non solo primo/ultimo) |
| `--ignore-patterns` | `-ip`  | string[] | No           | Da config | Pattern da ignorare (separati da virgola)        |

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
      "-DLQ-HasMessage"
    ]
  },
  "aws": {
    "profiles": ["sso_pn-core-prod_readonly", "sso_pn-confinfo-prod"]
  }
}
```

#### Sezione `ignore.patterns`

Pattern per escludere allarmi non rilevanti dall'analisi:

- I pattern sono **stringhe semplici** (non regex completi)
- Lo script compila automaticamente i pattern in una singola RegExp ottimizzata
- Un allarme viene ignorato se il suo nome **contiene** uno dei pattern

#### Sezione `aws.profiles`

Lista di profili AWS SSO da interrogare in modalita multi-account:

- Ogni profilo corrisponde a un account AWS diverso
- Le query vengono eseguite in **parallelo** per performance ottimali
- I risultati vengono **aggregati e deduplicati** automaticamente

### Priorita di Configurazione

1. **Parametri CLI** (priorita massima)
2. **File config.json** (fallback automatico)

## Utilizzo

### Modalita Multi-Account (Consigliata)

```bash
# Usando i profili da config.json
pnpm go:analyze:alarms -- \
  --start-date "2024-12-01T00:00:00Z" \
  --end-date "2024-12-15T23:59:59Z"

# Override profili da CLI
pnpm go:analyze:alarms -- \
  --start-date "2024-12-01T00:00:00Z" \
  --end-date "2024-12-15T23:59:59Z" \
  --aws-profiles "sso_pn-core-prod,sso_pn-confinfo-prod,sso_pn-helpdesk-prod"
```

### Modalita Singolo Account

```bash
# Specifica un singolo profilo
pnpm go:analyze:alarms -- \
  --start-date "2024-12-01T00:00:00Z" \
  --end-date "2024-12-15T23:59:59Z" \
  --aws-profiles sso_pn-core-prod
```

### Esempi Pratici

```bash
# Analisi ultima settimana su tutti i profili configurati
pnpm go:analyze:alarms -- \
  -sd "2024-12-08T00:00:00Z" \
  -ed "2024-12-15T23:59:59Z"

# Analisi con output verbose (tutti i timestamp)
pnpm go:analyze:alarms -- \
  -sd "2024-12-01T00:00:00Z" \
  -ed "2024-12-15T23:59:59Z" \
  --verbose

# Analisi di un allarme specifico su piu account
pnpm go:analyze:alarms -- \
  -sd "2024-12-01T00:00:00Z" \
  -ed "2024-12-15T23:59:59Z" \
  -aps "sso_pn-core-prod,sso_pn-confinfo-prod" \
  --alarm-name "pn-delivery-push-ErrorAlarm"

# Override dei pattern di ignore
pnpm go:analyze:alarms -- \
  -sd "2024-12-01T00:00:00Z" \
  -ed "2024-12-15T23:59:59Z" \
  --ignore-patterns "-test-,-sandbox-,-dev-"
```

### Modalita Production

```bash
# Build e esecuzione
pnpm --filter=go-report-alarms build
pnpm go:analyze:alarms:prod -- \
  --start-date "2024-12-01T00:00:00Z" \
  --end-date "2024-12-15T23:59:59Z"
```

### Formato Timestamp

I timestamp sono mostrati in due formati:

1. **ISO 8601**: `2024-12-01T08:15:30.000Z` (UTC)
2. **Google Sheets**: `01/12/2024 09:15:30` (Europe/Rome, formato dd/MM/yyyy HH:mm:ss)

### Modalita Verbose vs Compatta

**Modalita Compatta** (default): Per allarmi con piu di 2 occorrenze, mostra solo primo e ultimo timestamp.

**Modalita Verbose** (`--verbose`): Mostra tutti i timestamp per ogni allarme.

## Troubleshooting

### Errore: "ExpiredToken" / Profilo fallito

**Causa**: Sessione AWS SSO scaduta per uno o piu profili.

**Comportamento**: Lo script continua con i profili funzionanti e mostra un warning.

**Soluzione**: GOScript tenta il login automatico. Se fallisce:

```bash
# Login manuale per il profilo specifico
aws sso login --profile sso_pn-core-prod

# Verificare la sessione
aws sts get-caller-identity --profile sso_pn-core-prod
```

### Errore: "All profile queries failed"

**Causa**: Tutte le sessioni SSO sono scadute o i profili non sono configurati.

**Soluzione**:

```bash
# Verificare i profili configurati
cat ~/.aws/config | grep profile

# Effettuare login per ogni profilo
aws sso login --profile sso_pn-core-prod
aws sso login --profile sso_pn-confinfo-prod
```

### Errore: "Invalid start date" / "Invalid end date"

**Causa**: Formato data non valido.

**Soluzione**: Usare formato ISO 8601 completo:

```bash
# Corretto
--start.date "2024-12-01T00:00:00Z"

# Errato
--start.date "2024-12-01"
--start.date "01/12/2024"
```

### Errore: "Cannot find module '@go-automation/go-common'"

**Causa**: La libreria comune non e stata compilata.

**Soluzione**:

```bash
# Dalla root del monorepo
pnpm build:common
pnpm --filter=go-report-alarms build
```

### Nessun Allarme Trovato

**Cause possibili**:

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
  --start-date "2024-12-01T00:00:00Z" \
  --end-date "2024-12-15T23:59:59Z"

# Verificare type errors
pnpm --filter=go-report-alarms exec tsc --noEmit
```

---

**Ultima modifica**: 2025-02-02
**Maintainer**: Team GO - Gestione Operativa
**Repository**: [go-automation](https://github.com/pagopa/go-automation)
