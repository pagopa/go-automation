# go-report-error-patterns

> Versione: 1.0.0 | Autore: Team GO - Gestione Operativa

Script per analizzare le occorrenze di attivazione di allarmi AWS CloudWatch ed estrarre i relativi pattern di errore dominanti e ricorrenti dai CloudWatch Logs tramite pattern analysis mirata sui datapoint di violazione.

## Indice

- [Funzionalità](#funzionalità)
- [Prerequisiti](#prerequisiti)
- [Configurazione](#configurazione)
- [Utilizzo](#utilizzo)
- [Output](#output)
- [Troubleshooting](#troubleshooting)

## Funzionalità

- **Ispezione storico allarmi**: interroga lo storico delle transizioni di stato verso `ALARM` in un arco temporale configurabile (`AWSCloudWatchAlarmsService.describeAlarmStateTransitions`).
- **Finestra temporale automatica e mirata**: calcola dinamicamente l'intervallo temporale `[queryStartTime, queryEndTime]` a partire dai timestamp dei datapoint responsabili dell'attivazione (`evaluatingDatapoints`), minimizzando il volume di log scansionati.
- **Espansione finestra configurabile**: possibilità di configurare un margine temporale simmetrico prima e dopo la finestra calcolata tramite il parametro `time-window-extra-seconds`.
- **Pattern analysis CloudWatch Logs**: esecuzione di query CloudWatch Logs Insights mirate con estrazione automatica dei pattern e dei rispettivi valori di ratio (%) e conteggi (`AWSCloudWatchLogsService.query`).
- **Sistema di report modulari**:
  - **Report A — Dominant Pattern**: individua il pattern con il `ratio (%)` massimo per ciascuna occorrenza e calcola la frequenza con cui ciascun pattern è risultato la causa dominante dell'allarme.
  - **Report B — Pattern Coverage**: misura la trasversalità dei pattern contando in quante occorrenze distinte ciascun pattern è comparso nei log analizzati.
  - **Report C — Tied Pattern Combinations**: traccia le occorrenze con pareggi (pattern con ratio (%) massimo equivalente) e aggrega le combinazioni ricorrenti di pattern in pareggio.
- **Flessibilità di profiling**: il profilo AWS associato ad un allarme può essere specificato tramite opportuna proprietà (`profile`) all'interno del file di configurazione e che, in assenza di questo, lo script verificherà la presenza di tale allarme tra tutti i profili forniti in input allo script tramite il parametro `--aws-profiles`.
- **Output dettagliato**: rendering tabellare a console ed esportazione automatica dei report in file JSON strutturati e indentati.

## Prerequisiti

### Software Richiesto

| Software   | Versione Minima | Note                                        |
| ---------- | --------------- | ------------------------------------------- |
| Node.js    | >= 22.14.0      | Definito in `package.json` (`engines`)      |
| pnpm       | >= 10.28.0      | Definito in `package.json` (`engines`)      |
| TypeScript | >= 6.0.0        | Incluso nel catalogo del workspace monorepo |

### Account e Permessi

- [ ] Accesso ad account AWS con permessi IAM minimi necessari:
  - `cloudwatch:DescribeAlarmHistory` (lettura cronologia transizioni e dettagli datapoint)
  - `logs:StartQuery`, `logs:GetQueryResults`, `logs:DescribeLogGroups`, `logs:StopQuery` (esecuzione e recupero risultati query CloudWatch Logs Insights)

### Credenziali AWS

Prima dell'esecuzione, autenticarsi con il profilo desiderato tramite AWS CLI:

```bash
aws sso login --profile [nome-profilo]
```

## Configurazione

### Parametri CLI

| Parametro        | Alias       | Tipo     | Obbligatorio | Default | Descrizione                                                                                         |
| ---------------- | ----------- | -------- | ------------ | ------- | --------------------------------------------------------------------------------------------------- |
| `--config-file`  | `-f`, `-cf` | string   | Sì           | -       | Percorso del file JSON di configurazione dell'analisi.                                              |
| `--aws-profiles` | `-aps`      | string[] | No           | -       | Elenco profili AWS SSO separati da virgola. Opzionale se ogni allarme specifica il proprio profilo. |

### Variabili d'Ambiente

| Variabile     | Descrizione                         | Esempio        |
| ------------- | ----------------------------------- | -------------- |
| `AWS_PROFILE` | Profilo AWS predefinito di fallback | `prod-account` |
| `AWS_REGION`  | Regione AWS predefinita             | `eu-south-1`   |

### File di Configurazione

Percorso specificabile tramite parametro `--config-file` (es. `configs/config.json`).
Il file può contenere un singolo oggetto oppure un array di oggetti configurazione per eseguire l'analisi sequenziale su più allarmi.

```json
[
  {
    "profile": "prod-account",
    "alarm-name": "service-a-5xx",
    "log-group": "/aws/ecs/service-a",
    "alarm-history-start-date": "2026-11-01T00:00:00Z",
    "alarm-history-end-date": "2026-11-03T23:59:59Z",
    "query-aws-cloudwatch": "fields @timestamp, @message | filter @message like /ERROR/ | pattern @message",
    "time-window-extra-seconds": 30
  },
  {
    "profile": "dev-account",
    "alarm-name": "service-b-latency",
    "log-group": "/aws/ecs/service-b",
    "alarm-history-start-date": "2026-11-01T00:00:00Z",
    "alarm-history-end-date": "2026-11-03T23:59:59Z",
    "query-aws-cloudwatch": "fields @timestamp, @message | pattern @message",
    "time-window-extra-seconds": 0
  }
]
```

#### Dettaglio Campi di Configurazione

| Proprietà                   | Tipo             | Obbligatorio | Descrizione                                                                                           |
| --------------------------- | ---------------- | ------------ | ----------------------------------------------------------------------------------------------------- |
| `alarm-name`                | string           | Sì           | Nome dell'allarme CloudWatch da analizzare.                                                           |
| `alarm-history-start-date`  | string \| number | Sì           | Data/ora iniziale dell'intervallo di ricerca dello storico (ISO 8601 o millisecondi).                 |
| `alarm-history-end-date`    | string \| number | Sì           | Data/ora finale dell'intervallo di ricerca dello storico (ISO 8601 o millisecondi).                   |
| `log-group`                 | string           | Sì           | Nome del CloudWatch Log Group da interrogare.                                                         |
| `query-aws-cloudwatch`      | string           | Sì           | Query CloudWatch Logs Insights (deve contenere il comando `pattern`).                                 |
| `profile`                   | string           | No           | Profilo AWS specifico per l'allarme. Se omesso, si utilizzano i profili passati via `--aws-profiles`. |
| `time-window-extra-seconds` | number           | No           | Secondi extra da aggiungere prima e dopo la finestra temporale di analisi (default: `0`).             |

### Priorità di Configurazione

1. Campo `profile` specificato nel file di configurazione per il singolo allarme
2. Parametri CLI (`--aws-profiles`, `--config-file`)
3. Variabili d'ambiente AWS (`AWS_PROFILE`, `AWS_REGION`)
4. Valori di default (es. `time-window-extra-seconds: 0`)

## Utilizzo

### Modalità Development (via pnpm/tsx)

```bash
# Dalla root del monorepo tramite shortcut
pnpm go:report:error:patterns:dev -- --config-file scripts/go/go-report-error-patterns/configs/config.json

# Dalla root con pnpm filter
pnpm --filter=go-report-error-patterns dev --config-file configs/config.json

# Dalla cartella dello script
pnpm dev --config-file configs/config.json

# Con specifica profili AWS via CLI
pnpm dev --config-file configs/config.json --aws-profiles prod-account,dev-account
```

### Modalità Production (build + node)

```bash
# Dalla root del monorepo
pnpm go:report:error:patterns:build
pnpm go:report:error:patterns:prod -- --config-file scripts/go/go-report-error-patterns/configs/config.json

# Dalla cartella dello script
pnpm build
pnpm start -- --config-file configs/config.json
```

### Modalità Standalone

```bash
# Esecuzione diretta del bundle compilato
node dist/index.js --config-file configs/config.json --aws-profiles prod-account
```

### Esempi Pratici

```bash
# Esempio 1: Esecuzione con profili specificati all'interno della configurazione JSON
pnpm dev --config-file configs/config.json

# Esempio 2: Esecuzione indicando i profili AWS tramite CLI
pnpm dev --config-file configs/config.json --aws-profiles prod-account

# Esempio 3: Utilizzo degli alias brevi dei parametri
pnpm dev -cf configs/config.json -aps prod-account
```

## Output

### Formato Report

Durante l'esecuzione, lo script genera output su console e salva 3 file JSON nella cartella di output dell'esecuzione:

- **Dominant Pattern Report**: `report-dominant-pattern.json`  
  Contiene l'elenco dei pattern risultati dominanti (maggior ratio (%) in ciascuna occorrenza), il numero di volte che ciascuno è risultato dominante, la percentuale sul totale delle occorrenze e la segnalazione di eventuali pareggi (`hasTies`).
- **Pattern Coverage Report**: `report-pattern-coverage.json`  
  Contiene la misura di trasversalità dei pattern: per ogni pattern rilevato, indica il numero di occorrenze distinte in cui è comparso e la relativa percentuale sul totale delle occorrenze.
- **Tied Pattern Combinations Report**: `report-tied-pattern-combinations.json`  
  Riepiloga le combinazioni di pattern che hanno condiviso il ratio (%) massimo nelle stesse occorrenze. Qualora non si siano verificati pareggi, il report include un messaggio esplicativo.

### Esempio Output Console

```
╭─────────────────────────────────────────╮
│  go-report-error-patterns v1.0.0        │
│  Team GO - Gestione Operativa           │
╰─────────────────────────────────────────╯

► Starting Go Report Error Patterns
  Analisi configurazione per allarme: "service-a-5xx"
  Intervallo ricerca allarme: 2026-11-01T00:00:00.000Z -> 2026-11-03T23:59:59.000Z
  Log Group: /aws/ecs/service-a

► Esecuzione su profilo AWS: prod-account
  Recupero transizioni di stato dell'allarme "service-a-5xx"...
  Trovate 10 transizioni verso ALARM.
  [1/10] Esecuzione query pattern per allarme delle 2026-11-01T10:15:00.000Z (finestra: 2026-11-01T10:13:30.000Z -> 2026-11-01T10:15:30.000Z)...
    -> Rilevati 3 pattern.
  ...

► Report Dominant Pattern - Profilo: prod-account
  Nome allarme: service-a-5xx
  Metodologia: Per ogni occorrenza dell'allarme, viene identificato il pattern con il valore di ratio più alto (percentuale di presenza nei log analizzati per quella finestra temporale)...
  Numero totale di occorrenze allarme: 10
  Occorrenze con pattern nei log: 9
  Occorrenze senza pattern nei log: 1

  ┌───┬──────────────────────────────────────────┬─────────────────┬─────────────────┬──────┐
  │ # │ Pattern                                  │ Volte dominante │ % su occorrenze │ Note │
  ├───┼──────────────────────────────────────────┼─────────────────┼─────────────────┼──────┤
  │ 1 │ Connection timeout to database           │ 7               │ 70.00%          │      │
  │ 2 │ NullPointerException in payment service  │ 2               │ 20.00%          │ *    │
  └───┴──────────────────────────────────────────┴─────────────────┴─────────────────┴──────┘
  * = selezionato in presenza di pareggio (vedi Report C per il dettaglio)

► Report Pattern Coverage - Profilo: prod-account
  Nome allarme: service-a-5xx
  Metodologia: Per ogni pattern trovato, viene contato in quante occorrenze distinte dell'allarme è comparso, indipendentemente dal suo ratio in quella specifica occorrenza...
  Numero totale di occorrenze allarme: 10
  Occorrenze con pattern nei log: 9
  Occorrenze senza pattern nei log: 1

  ┌───┬──────────────────────────────────────────┬─────────────────────────┬─────────────────┐
  │ # │ Pattern                                  │ Occorrenze con presenza │ % su occorrenze │
  ├───┼──────────────────────────────────────────┼─────────────────────────┼─────────────────┤
  │ 1 │ Connection timeout to database           │ 9                       │ 90.00%          │
  │ 2 │ Connection refused                       │ 6                       │ 60.00%          │
  │ 3 │ NullPointerException in payment service  │ 2                       │ 20.00%          │
  └───┴──────────────────────────────────────────┴─────────────────────────┴─────────────────┘

► Report Tied Pattern Combinations - Profilo: prod-account
  Nome allarme: service-a-5xx
  Metodologia: Dettaglia le occorrenze in cui più pattern hanno condiviso il ratio massimo (pareggio), rendendo ambigua la selezione del pattern dominante nel Report A...
  Numero totale di occorrenze allarme: 10

  ┌───┬────────────────────────────────────────────────────────┬────────────┬─────────────────┐
  │ # │ Pattern in pareggio                                    │ Occorrenze │ % su occorrenze │
  ├───┼────────────────────────────────────────────────────────┼────────────┼─────────────────┤
  │ 1 │ NullPointerException in payment service + Auth timeout │ 2          │ 20.00%          │
  └───┴────────────────────────────────────────────────────────┴────────────┴─────────────────┘

  Report JSON salvato in: /path/to/output/report-dominant-pattern.json
  Report JSON salvato in: /path/to/output/report-pattern-coverage.json
  Report JSON salvato in: /path/to/output/report-tied-pattern-combinations.json

✓ Analisi dei pattern completata con successo.
```

## Troubleshooting

### Problemi Comuni

#### Errore: "AWS credentials not found" o sessione SSO scaduta

**Causa**: Mancata configurazione delle credenziali o sessione SSO scaduta.

**Soluzione**:

```bash
aws sso login --profile [nome-profilo]
```

#### Errore: "Nessun profilo AWS specificato per l'allarme"

**Causa**: La voce dell'allarme nel file di configurazione non ha il campo `profile` e il parametro `--aws-profiles` (o `-aps`) non è stato valorizzato da riga di comando.

**Soluzione**: Aggiungere la proprietà `"profile": "<nome-profilo>"` all'oggetto nel file JSON o passare il parametro `--aws-profiles <nome-profilo>` (o `-aps <nome-profilo>`).

#### Errore: "Invalid date format"

**Causa**: I valori `alarm-history-start-date` o `alarm-history-end-date` contengono una stringa non interpretabile come data.

**Soluzione**: Usare il formato standard ISO 8601 (es. `2026-11-01T00:00:00Z`) o un timestamp numerico in millisecondi.

#### Errore: "Module not found" o build non allineata

**Causa**: Dipendenze monorepo non collegate o codice TypeScript non compilato.

**Soluzione**:

```bash
pnpm install
pnpm build:common
pnpm --filter=go-report-error-patterns build
```

### Debug Mode

```bash
# Esecuzione con log di debug
DEBUG=* pnpm dev --config-file configs/config.json

# Type-check TypeScript senza compilare
pnpm exec tsc --noEmit
```

---

**Ultima modifica**: 2026-11-06  
**Maintainer**: Team GO - Gestione Operativa
