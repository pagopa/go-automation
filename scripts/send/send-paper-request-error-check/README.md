# Send Paper Request Error Check

Script unificato per la diagnosi, la verifica degli allegati, il ripristino da S3 Glacier/delete marker, la validazione dei PDF e la generazione dei report sulle anomalie delle spedizioni cartacee.

## Prerequisiti

- Node.js >= 22.14.0
- pnpm >= 10.28.0
- Credenziali AWS SSO configurate per gli ambienti di riferimento

Log in AWS di esempio:

```bash
aws sso login --profile sso_pn-core-dev
```

## Configurazione e Modalità di Esecuzione

Lo script supporta sia l'esecuzione dell'intera pipeline unificata sia l'esecuzione modulare di uno specifico sotto-step tramite la CLI `--mode` (`-m`).

### Modalità Disponibili (`--mode`)

1. **`all`** (default): Esegue sequenzialmente tutti gli step e genera il report finale aggregato.
2. **`check-feedback`**: Verifica la presenza degli eventi `SEND_ANALOG_FEEDBACK` o `COMPLETELY_UNREACHABLE` su DynamoDB (`pn-Timelines`) a partire da un elenco di `requestId`.
3. **`get-attachments`**: Verifica l'esistenza degli allegati su S3 e `pn-SsDocumenti` per una lista di IUN, rimuovendo gli S3 Delete Markers ed aggiornando lo stato in caso di `--restore`.
4. **`retrieve-attachments`**: Recupera le chiavi S3 degli allegati e dei documenti AAR (`AAR_GENERATION`) per ogni IUN.
5. **`retrieve-glacier`**: Richiede il ripristino da S3 Glacier degli oggetti archiviati. **Include una richiesta di conferma interattiva all'utente** prima di inviare le richieste di restore. Se l'utente risponde "No", lo step viene saltato ed il flusso prosegue.
6. **`validate-pdf`**: Effettua la validazione dei magic bytes `%PDF` (Range Request S3 `bytes=0-4`) con controllo di concorrenza ad alte prestazioni.
7. **`fetch-timelines`**: Scarica le timeline complete da DynamoDB (`pn-Timelines`) per un elenco di IUN e le salva in `results/timelines.json`.

### Parametri CLI

| Parametro | Alias | Tipo | Default | Descrizione |
|-----------|-------|------|---------|-------------|
| `--mode` | `-m` | string | `all` | Modalità di esecuzione (`all`, `check-feedback`, `get-attachments`, `retrieve-attachments`, `retrieve-glacier`, `validate-pdf`, `fetch-timelines`) |
| `--aws.profile` | `-p`, `--profile` | string | - | Nome del profilo AWS SSO |
| `--envName` | `-e` | string | - | Nome dell'ambiente (`dev`, `uat`, `test`, `prod`, `hotfix`) |
| `--inputFile` | `-f`, `--input` | string | - | Percorso del file di input contenente IUN, requestId o chiavi S3 |
| `--bucket` | `-b` | string | - | Nome del bucket S3 (risolto automaticamente se non specificato) |
| `--restore` | `-r` | boolean | `false` | Abilita il ripristino per allegati e marker di cancellazione |
| `--outputDir` | `-o` | string | `./results` | Directory di output per i report e file di risultato |
| `--glacier.expirationDays` | - | number | `30` | Giorni di disponibilità per i documenti ripristinati da Glacier |
| `--glacier.tier` | - | string | `Bulk` | Velocità di ripristino Glacier (`Bulk`, `Standard`, `Expedited`) |
| `--pdfValidation.concurrency` | - | number | `20` | Richieste S3 concorrenti per la validazione dei PDF |

## Utilizzo

### Esecuzione della pipeline completa

```bash
pnpm --filter=send-paper-request-error-check dev --inputFile ./input_iuns.txt --envName dev
```

### Esempi di esecuzione modulare

```bash
# 1. Check feedback analogico da requestId
pnpm --filter=send-paper-request-error-check dev --mode check-feedback --inputFile ./requestIds.txt --envName dev

# 2. Ripristino allegati da notifiche con remove delete markers
pnpm --filter=send-paper-request-error-check dev --mode get-attachments --inputFile ./iuns.txt --restore --envName dev

# 3. Restore da S3 Glacier (con prompt di conferma utente)
pnpm --filter=send-paper-request-error-check dev --mode retrieve-glacier --inputFile ./glacier_keys.txt --envName dev

# 4. Validazione Magic Bytes PDF su S3
pnpm --filter=send-paper-request-error-check dev --mode validate-pdf --inputFile ./s3_keys.txt --envName dev

# 5. Download delle timeline da DynamoDB per IUN
pnpm --filter=send-paper-request-error-check dev --mode fetch-timelines --inputFile ./iuns.txt --envName dev
```

## Report di Output

Al termine dell'esecuzione, la directory `results/` viene popolata con:
- `summary_report.json`: Report JSON sintetico con la tabella completa delle metriche tracciate.
- `summary_report.csv`: Report CSV con la chiave e il valore di ciascuna metrica.
- File di dettaglio specifici dei singoli moduli (`found.json`, `not_found.txt`, `valid_pdfs.csv`, `invalid_pdfs.csv`, `timelines.json`, ecc.).
