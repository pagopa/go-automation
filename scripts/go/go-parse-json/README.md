# GO Parse JSON

> Versione: 1.1.0 | Maintainer: Team GO - Gestione Operativa | Ultima modifica: 2026-04-08

Script di automazione avanzato per l'estrazione e il filtraggio di dati da file JSON e NDJSON locali. Supporta l'estrazione multi-campo, la ricerca ricorsiva, il filtraggio tramite predicati e l'esportazione in formati multipli.

## Indice

- [Obiettivo](#obiettivo)
- [Prerequisiti](#prerequisiti)
- [Configurazione](#configurazione)
- [Utilizzo](#utilizzo)
- [Output](#output)
- [Funzionamento e Sicurezza](#funzionamento-e-sicurezza)
- [Troubleshooting](#troubleshooting)

---

## Obiettivo
Estrazione e trasformazione flessibile di dati da file JSON/NDJSON locali, con supporto per filtraggio avanzato, navigazione ricorsiva e molteplici formati di output.

## Prerequisiti
- **Software**: Node.js (>= 22.14.0), pnpm (>= 10.0.0).

## Configurazione

### Parametri CLI

| Parametro | Alias | Obbligatorio | Default | Descrizione |
|-----------|-------|--------------|---------|-------------|
| `--input-file` | `-i` | Sì | - | Percorso file JSON o NDJSON locale. |
| `--field` | `-f` | Sì | - | Campi da estrarre (separati da virgola). |
| `--output-format` | `-ff` | No | `txt` | Formato: `txt`, `json`, `jsonl`, `csv`, `html`. |
| `--filter` | `-L` | No | - | Predicato filtro (es. `status=FAILED`). |

## Utilizzo

*Esempi di comandi standardizzati per scenari comuni.*

**Scenario A: Estrazione multi-campo in CSV**
```bash
pnpm go:parse:json:dev --input-file input.ndjson --field "id,status" --output-format csv
```

**Scenario B: Estrazione con filtro**
```bash
pnpm go:parse:json:dev --input-file logs.json --field "requestId,error" --filter "level=ERROR"
```

## Output
- **Artifacts**: File di output salvati in `data/go-parse-json/outputs/...`.
- **Formati**: Supporta TXT, JSON, JSONL, CSV, HTML.

## Funzionamento e Sicurezza
*Informazioni per PR reviewers e operatori.*
- **Logica Operativa**:
  1. Applica il predicato `--filter` se presente.
  2. Estrae i campi richiesti tramite `GOJSONFieldExtractor`.
  3. Esegue deduplicazione confrontando l'intero contenuto dell'oggetto estratto.
- **Azioni Distruttive**: Nessuna (read-only).
- **Idempotenza**: Sì.

## Troubleshooting
- **Errore: "Field not found"**: Verificare che il percorso del campo (dot-notation) sia corretto rispetto alla struttura del file JSON.
- **Supporto**: Contattare il Team GO - Gestione Operativa.
