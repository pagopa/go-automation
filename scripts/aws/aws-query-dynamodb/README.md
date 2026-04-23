# AWS Query DynamoDB

> Versione: 1.0.0 | Autore: Team GO - Gestione Operativa

Script di automazione per il recupero di dati da tabelle DynamoDB tramite Partition Key. Supporta input multipli, proiezione di attributi, indici secondari (GSI/LSI) e diversi formati di output.

## Indice

- [Funzionalità](#funzionalità)
- [Prerequisiti](#prerequisiti)
- [Configurazione](#configurazione)
- [Utilizzo](#utilizzo)
- [Output](#output)
- [Troubleshooting](#troubleshooting)

## Funzionalità

Lo script esegue le seguenti operazioni:

- **Input Flessibile**: Caricamento di Partition Key (PK) da file (TXT, JSONL, CSV) o direttamente da riga di comando. Supporta file situati in qualsiasi percorso (assoluto o relativo).
- **Query Mirate**: Possibilità di recuperare l'intero item o solo un sottoinsieme di attributi specifici.
- **Supporto Indici e Sort Key**: Interrogazione di tabelle con Sort Key (richiesta se presente nello schema) e supporto per Global/Local Secondary Indexes.
- **Controllo Schema**: Verifica preliminare dello schema della tabella o dell'indice per validare le chiavi fornite.
- **Supporto Prefissi/Suffissi**: Aggiunta automatica di prefissi o suffissi alle PK prima della query.
- **Meccanismo di Retry**: Gestione robusta dei limiti di throughput (ProvisionedThroughputExceeded) e problemi di connessione con backoff esponenziale.
- **Streaming**: Esportazione efficiente su file anche per dataset di grandi dimensioni.
- **Mapping Risultati**: Ogni PK di input è mappata ai relativi item trovati nel report finale.

## Prerequisiti

### Software Richiesto

| Software   | Versione Minima | Note                 |
| ---------- | --------------- | -------------------- |
| Node.js    | >= 22.14.0      | LTS consigliata      |
| pnpm       | >= 10.0.0       | Package manager      |
| TypeScript | >= 5.0.0        | Incluso nel progetto |

### Account e Permessi

- [ ] Accesso AWS con profilo SSO configurato.
- [ ] Permessi IAM per `dynamodb:DescribeTable` e `dynamodb:Query` sulla tabella di destinazione.

## Configurazione

### Parametri CLI

| Parametro             | Alias                   | Tipo   | Obblig. | Default | Descrizione                                                      |
| --------------------- | ----------------------- | ------ | ------- | ------- | ---------------------------------------------------------------- |
| `--aws-profile`       | `-ap`                   | string | Si      | -       | Nome del profilo AWS SSO.                                        |
| `--table-name`        | `-table`                | string | Si      | -       | Nome della tabella DynamoDB da interrogare.                      |
| `--index-name`        | `-index`                | string | No      | -       | Nome dell'indice (GSI/LSI) da interrogare.                       |
| `--table-key`         | `-key`                  | string | Si      | -       | Nome dell'attributo Partition Key (nella tabella o indice).      |
| `--table-sort-key`    | `-sk`, `-sort-key`      | string | No      | -       | Nome dell'attributo Sort Key (richiesto se presente nel target). |
| `--table-sort-value`  | `-sv`, `-sort-value`    | string | No      | -       | Valore della Sort Key (richiesto se `--table-sort-key` è usato). |
| `--input-pks`         | `-pks`, `-keys`         | string | No      | -       | Elenco di PK separati da virgola (input da CLI).                 |
| `--input-file`        | `-input`                | string | No      | -       | Percorso del file (assoluto o relativo) contenente le PK.        |
| `--input-format`      | `-if`                   | string | No      | txt     | Formato file input: `txt`, `jsonl`, `csv`.                       |
| `--csv-column`        | -                       | string | No      | -       | Nome colonna CSV per le PK (default: prima colonna).             |
| `--csv-delimiter`     | -                       | string | No      | `,`     | Delimitatore CSV.                                                |
| `--output-file`       | `-output`               | string | No      | -       | Percorso del file di output per i risultati.                     |
| `--output-attributes` | `-attributes`, `-attrs` | string | No      | -       | Attributi da recuperare (separati da virgola).                   |
| `--output-format`     | `-format`               | string | No      | json    | Formato output: `dynamo-json`, `json`, `ndjson`, `csv`, `text`.  |
| `--key-prefix`        | `-prefix`               | string | No      | -       | Prefisso da aggiungere a ogni PK.                                |
| `--key-suffix`        | `-suffix`               | string | No      | -       | Suffisso da aggiungere a ogni PK.                                |
| `--dry-run`           | `-dry`                  | bool   | No      | false   | Mostra le PK che verrebbero interrogate senza eseguire query.    |

## Utilizzo

### Esempi Pratici

```bash
# Query da CLI per singola PK recuperando tutto l'item
pnpm aws:query:dynamodb:dev --aws-profile sso_pn-core-prod --table-name pn-Notifications --table-key pk --input-pks "NOTIF##123"

# Query su un indice (GSI) con Sort Key
pnpm aws:query:dynamodb:dev --aws-profile sso_pn-core-prod --table-name pn-Timelines --index-name byIun --table-key iun --table-sort-key category --table-sort-value "NOTIFICATION_VIEWED" --input-pks "IUN1,IUN2"

# Query da file CSV (percorso non predefinito) recuperando solo alcuni attributi
pnpm aws:query:dynamodb:dev --aws-profile sso_pn-core-prod --table-name pn-Data --table-key id --input-file /tmp/input_data.csv --input-format csv --output-attributes "id,status" --output-file results.json
```

## Output

### Output Console e File

Al termine dell'esecuzione, lo script:

1. Stampa sempre un oggetto JSON **pretty-formatted** in console che rappresenta il mapping tra le PK fornite in input e gli item trovati.
2. Salva automaticamente lo stesso mapping in un file `results.json` all'interno della cartella di output dell'esecuzione (es. `data/aws-query-dynamodb/outputs/aws-query-dynamodb_timestamp/results.json`).

```json
{
  "PK1": [{ "attr1": "val1" }, { "attr1": "val2" }],
  "PK2": []
}
```

### File di Output

I formati supportati per il file di output (`--output-file`) sono:

- **dynamo-json**: Formato raw di DynamoDB (con i tipi come `{"S": "value"}`).
- **json**: Array standard di oggetti JSON (unmarshalled).
- **ndjson**: Newline Delimited JSON, ideale per dataset massivi.
- **csv**: Disponibile solo se sono specificati degli attributi. Include la colonna della PK.
- **text**: Formato testuale semplice (`PK: val1, val2`).

## Troubleshooting

### Problemi Comuni

#### Errore: "Table/Index requires a sort key (SK_NAME), but table.sort-key or table.sort-value is missing"

**Causa**: La tabella o l'indice selezionato ha una chiave di ordinamento definita nello schema, ma non è stata fornita nei parametri.
**Soluzione**: Aggiungere `--table-sort-key SK_NAME --table-sort-value VALORE` alla riga di comando.

#### Errore: "Input file not found"

**Causa**: Il file specificato in `--input-file` non esiste nel percorso indicato.
**Soluzione**: Verificare il percorso (assoluto o relativo alla cartella corrente). Se il file è nella cartella `inputs` dello script, basta il nome del file.

---

**Ultima modifica**: 2026-04-23
**Maintainer**: Team GO - Gestione Operativa
