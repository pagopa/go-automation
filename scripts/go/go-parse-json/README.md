# GO Parse JSON

> Versione: 1.1.0 | Autore: Team GO - Gestione Operativa

Script di automazione avanzato per l'estrazione e il filtraggio di dati da file JSON, NDJSON, S3 e CloudWatch Logs. Supporta l'estrazione multi-campo, la ricerca ricorsiva, il filtraggio tramite predicati e l'esportazione in formati multipli.

## Indice

- [GO Parse JSON](#go-parse-json)
  - [Indice](#indice)
  - [Funzionalità](#funzionalità)
  - [Prerequisiti](#prerequisiti)
  - [Configurazione](#configurazione)
    - [Parametri CLI](#parametri-cli)
  - [Utilizzo](#utilizzo)
    - [Modalità Development (via pnpm/tsx)](#modalità-development-via-pnpmtsx)
    - [Modalità Production (build + node)](#modalità-production-build--node)
    - [Esempi Pratici](#esempi-pratici)
  - [Formati di Output](#formati-di-output)
  - [Logica di Estrazione](#logica-di-estrazione)

## Funzionalità

- **Supporto Multi-sorgente**: gestisce file locali (JSON/NDJSON), oggetti S3 (`s3://bucket/key`) e Log Groups di CloudWatch (`cwl:/log-group-name`).
- **Estrazione Multi-campo**: permette di estrarre piu campi contemporaneamente separandoli con la virgola (es. `id,status,user.email`).
- **Filtraggio Avanzato**: supporta filtri semplici via CLI (es. `--filter "status=FAILED"`) per processare solo i record rilevanti.
- **Deep-path Discovery**: permette di specificare un `jsonPath` per navigare fino a un array annidato all'interno di una struttura complessa.
- **Rilevamento Automatico**: identifica il formato dei file locali tramite estensione (`.json`, `.ndjson`, `.jsonl`) e ispezione del contenuto.
- **Estrazione Flessibile**: supporta la dot-notation per percorsi esatti e la ricerca ricorsiva come fallback, incluso il parsing di JSON embedded.
- **Esportazione Multi-formato**: i risultati possono essere esportati in TXT, JSON, JSONL, CSV o HTML.
- **Deduplicazione**: rimuove i record duplicati per garantire un output pulito.

## Prerequisiti

| Software | Versione Minima | Note            |
| -------- | --------------- | --------------- |
| Node.js  | >= 22.14.0      | LTS consigliata |
| pnpm     | >= 10.0.0       | Package manager |

## Configurazione

### Parametri CLI

| Parametro         | Alias | Tipo    | Obbligatorio | Default | Descrizione                                                                         |
| ----------------- | ----- | ------- | ------------ | ------- | ----------------------------------------------------------------------------------- |
| `--input-file`    | `-i`  | string  | Si           | -       | Percorso file locale o URI AWS (`s3://...`, `cwl:/...`).                            |
| `--field`         | `-f`  | string  | Si           | -       | Campi da estrarre separati da virgola (supporta dot-notation o ricerca per chiave). |
| `--output-file`   | `-o`  | string  | No           | auto    | Percorso del file di output. Default: `extracted_<timestamp>.<ext>`.                |
| `--output-format` | `-ff` | string  | No           | `txt`   | Formato di output: `txt`, `json`, `jsonl`, `csv`, `html`.                           |
| `--filter`        | `-L`  | string  | No           | -       | Filtro predicato semplice (es. `status=FAILED`).                                    |
| `--json-path`     | `-jp` | string  | No           | -       | Path JSON per individuare l'array di dati in strutture nidificate.                  |
| `--start-time`    | `-st` | string  | No           | -       | Data inizio per CloudWatch Logs (ISO 8601).                                         |
| `--end-time`      | `-et` | string  | No           | -       | Data fine per CloudWatch Logs (ISO 8601).                                           |
| `--tail`          | `-t`  | boolean | No           | `false` | (Sperimentale) Abilita modalità tail per CloudWatch Logs.                           |

I percorsi relativi vengono risolti automaticamente dal framework GOScript:

- **Input**: `data/<script>/inputs/<file>`
- **Output**: `data/<script>/outputs/<script>_<timestamp>/<file>`

## Utilizzo

### Modalità Development (via pnpm/tsx)

```bash
# Estrazione multi-campo da locale a CSV
pnpm go:parse:json:dev --input-file input.ndjson --field "id,status,user.email" --output-format csv

# Estrazione da S3 con filtro
pnpm go:parse:json:dev --input-file s3://my-bucket/logs/app.json --field "requestId,error" --filter "level=ERROR"

# Estrazione da CloudWatch Logs con range temporale
pnpm go:parse:json:dev --input-file cwl:/aws/lambda/my-func --field "message" --start-time "2024-04-01T10:00:00Z"
```

### Modalità Production (build + node)

```bash
pnpm go:parse:json:prod --input-file input.json --field iun --output-format json
```

### Esempi Pratici

#### Estrazioni Semplici

- **Estrarre IUN da file locale:**

  ```bash
  pnpm go:parse:json:dev --input-file input.json --field iun
  ```

- **Estrarre campi nidificati:**

  ```bash
  pnpm go:parse:json:dev --input-file input.json --field "user.profile.email" --output-format json
  ```

#### Combinazione di Filtri e Multi-Campo

- **Estrarre ID ed Email per utenti attivi:**

  ```bash
  pnpm go:parse:json:dev --input-file users.json --field "id,email" --filter "active=true" --output-format csv
  ```

- **Analizzare errori in dump S3:**

  ```bash
  pnpm go:parse:json:dev --input-file s3://logs-bucket/dump.json --field "timestamp,source.ip,msg" --filter "level=ERROR" --output-format jsonl
  ```

#### Utilizzo con Strutture Complesse

- **Estrarre dati da API annidata:**

  ```bash
  pnpm go:parse:json:dev --input-file response.json --field "code,msg" --json-path "data.items"
  ```

- **CloudWatch Logs con filtro temporale e campo specifico:**

  ```bash
  pnpm go:parse:json:dev --input-file cwl:/aws/ecs/service-prod --field "message" \
    --start-time "2026-04-01T00:00:00Z" --end-time "2026-04-01T01:00:00Z" \
    --filter "level=ERROR"
  ```

## Formati di Output

| Formato | Estensione | Descrizione                                    | Exporter             |
| ------- | ---------- | ---------------------------------------------- | -------------------- |
| `txt`   | `.txt`     | Valore del primo campo per riga                | `GOFileListExporter` |
| `json`  | `.json`    | Array di oggetti JSON (pretty-printed)         | `GOJSONListExporter` |
| `jsonl` | `.jsonl`   | Un oggetto JSON per riga (NDJSON)              | `GOJSONListExporter` |
| `csv`   | `.csv`     | Tabella CSV con tutti i campi come colonne     | `GOCSVListExporter`  |
| `html`  | `.html`    | Tabella HTML interattiva con stile predefinito | `GOHTMLListExporter` |

## Logica di Estrazione

Lo script utilizza una combinazione di strumenti del core `go-common`:

1. **Filtering**: il predicato `--filter` viene applicato prima dell'estrazione.
2. **Multi-extraction**: per ogni record, vengono estratti tutti i campi richiesti tramite `GOJSONFieldExtractor`.
3. **Deduplicazione**: i record identici vengono rimossi confrontando l'intero contenuto dell'oggetto estratto.
4. **AWS Integration**: utilizza `S3Client` e `CloudWatchLogsClient` per recuperare i dati in modo trasparente prima del parsing.

---

**Ultima modifica**: 2026-04-04
**Maintainer**: Team GO - Gestione Operativa
