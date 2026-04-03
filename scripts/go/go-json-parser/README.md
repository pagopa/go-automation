# GO JSON Parser

> Versione: 1.0.0 | Autore: Team GO - Gestione Operativa

Script di automazione per l'estrazione di campi specifici da file JSON e NDJSON, con supporto per la ricerca ricorsiva, output ordinato e unico, ed esportazione in formati multipli.

## Indice

- [GO JSON Parser](#go-json-parser)
  - [Indice](#indice)
  - [Funzionalita](#funzionalita)
  - [Prerequisiti](#prerequisiti)
  - [Configurazione](#configurazione)
    - [Parametri CLI](#parametri-cli)
  - [Utilizzo](#utilizzo)
    - [Modalita Development (via pnpm/tsx)](#modalita-development-via-pnpmtsx)
    - [Modalita Production (build + node)](#modalita-production-build--node)
    - [Esempi Pratici](#esempi-pratici)
  - [Formati di Output](#formati-di-output)
  - [Logica di Estrazione](#logica-di-estrazione)

## Funzionalita

- **Supporto Multi-formato in ingresso**: gestisce file JSON standard (array, singolo oggetto) e NDJSON/JSONL (un oggetto per riga).
- **Rilevamento Automatico**: identifica il formato tramite estensione (`.json`, `.ndjson`, `.jsonl`) e ispezione del contenuto via `GOJSONFormatDetector`.
- **Singolo Oggetto**: un file JSON contenente un singolo oggetto viene trattato automaticamente come un array di un elemento.
- **Estrazione Flessibile**: supporta la dot-notation per percorsi esatti (`user.address.city`) e la ricerca ricorsiva come fallback, incluso il parsing di JSON embedded (es. body SQS stringificato).
- **Esportazione Multi-formato**: i risultati possono essere esportati in TXT, JSON, JSONL, CSV o HTML tramite il parametro `--output-format`.
- **Efficienza**: utilizza lo streaming per i file NDJSON per gestire file di grandi dimensioni.
- **Pulizia Dati**: rimuove i duplicati e ordina i risultati alfabeticamente.

## Prerequisiti

| Software   | Versione Minima | Note                 |
| ---------- | --------------- | -------------------- |
| Node.js    | >= 22.14.0      | LTS consigliata      |
| pnpm       | >= 10.0.0       | Package manager      |
| TypeScript | >= 5.0.0        | Incluso nel progetto |

## Configurazione

### Parametri CLI

| Parametro         | Alias | Tipo   | Obbligatorio | Default | Descrizione                                                                                                      |
| ----------------- | ----- | ------ | ------------ | ------- | ---------------------------------------------------------------------------------------------------------------- |
| `--input-file`    | `-i`  | string | Si           | -       | Percorso del file JSON o NDJSON (relativo alla directory input o assoluto).                                      |
| `--field`         | `-f`  | string | Si           | -       | Campo da estrarre (supporta dot-notation o ricerca per chiave).                                                  |
| `--output-file`   | `-o`  | string | No           | auto    | Percorso del file di output (relativo alla directory output o assoluto). Default: `extracted_<timestamp>.<ext>`. |
| `--output-format` | `-ff` | string | No           | `txt`   | Formato di output: `txt`, `json`, `jsonl`, `csv`, `html`.                                                        |

I percorsi relativi vengono risolti automaticamente dal framework GOScript:

- **Input**: `data/<script>/inputs/<file>`
- **Output**: `data/<script>/outputs/<script>_<timestamp>/<file>`

## Utilizzo

### Modalita Development (via pnpm/tsx)

```bash
# Estrazione base (output TXT)
pnpm go:json:parser:dev --input-file input.ndjson --field iun

# Estrazione con output JSON
pnpm go:json:parser:dev -i input.json -f metadata.id --output-format json

# Estrazione con output CSV e file di output specifico
pnpm go:json:parser:dev -i input.json -f iun -ff csv -o risultati.csv
```

### Modalita Production (build + node)

```bash
pnpm go:json:parser:prod --input-file input.json --field user.email --output-format jsonl
```

### Esempi Pratici

**Estrarre tutti gli IUN da un export SQS (NDJSON):**

```bash
pnpm go:json:parser:dev -i sqs-messages.ndjson -f iun
```

Lo script cerca il campo `iun` anche dentro body JSON stringificati (embedded JSON parsing).

**Estrarre email da un array JSON e salvare come CSV:**

```bash
pnpm go:json:parser:dev -i users.json -f user.profile.email -ff csv
```

Produce un CSV con header `user.profile.email` e i valori estratti.

**Estrarre dati da un singolo oggetto JSON:**

```bash
pnpm go:json:parser:dev -i single-record.json -f id
```

Il singolo oggetto viene automaticamente trattato come un array di un elemento.

## Formati di Output

| Formato | Estensione | Descrizione                                        | Exporter             |
| ------- | ---------- | -------------------------------------------------- | -------------------- |
| `txt`   | `.txt`     | Un valore per riga, testo semplice                 | `GOFileListExporter` |
| `json`  | `.json`    | Array JSON pretty-printed                          | `GOJSONListExporter` |
| `jsonl` | `.jsonl`   | Un valore JSON per riga (NDJSON)                   | `GOJSONListExporter` |
| `csv`   | `.csv`     | CSV con header (colonna = nome del campo estratto) | `GOCSVListExporter`  |
| `html`  | `.html`    | Tabella HTML con stile predefinito                 | `GOHTMLListExporter` |

L'estensione del file di output viene impostata automaticamente in base al formato scelto (se non viene specificato `--output-file`).

## Logica di Estrazione

Lo script utilizza `GOJSONFieldExtractor` con la strategia **Path-First with Recursive Fallback**:

1. **Percorso Esatto**: tenta di risolvere il campo usando il percorso fornito (es. `user.address.city` naviga `user` -> `address` -> `city`).
2. **Ricerca Ricorsiva**: se il percorso non produce risultati, cerca l'ultima parte della chiave (es. `city`) ricorsivamente in tutto l'oggetto, inclusi array e oggetti annidati.
3. **Embedded JSON**: se abilitato (default), analizza stringhe che contengono JSON (es. body SQS) per cercare il campo al loro interno.
4. **Conversione**: se il valore trovato non e una stringa, viene serializzato con `JSON.stringify`.
5. **Deduplicazione e Ordinamento**: i valori vengono raccolti in un `Set`, ordinati alfabeticamente, e passati all'exporter.

---

**Ultima modifica**: 2026-04-03
**Maintainer**: Team GO - Gestione Operativa
