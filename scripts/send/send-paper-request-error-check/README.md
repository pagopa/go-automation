# Send Paper Request Error Check

Script unificato per la diagnosi, la verifica degli allegati, il ripristino da S3 Glacier/delete marker e la generazione dei report sulle anomalie delle spedizioni cartacee.

## Prerequisiti

- Node.js >= 22.14.0
- pnpm >= 10.28.0
- Credenziali AWS SSO configurate per gli ambienti di riferimento

Log in AWS di esempio:

```bash
aws sso login --profile sso_pn-core-dev
```

## Configurazione

Lo script supporta sia l'esecuzione dell'intera pipeline unificata sia l'esecuzione modulare di uno specifico sotto-step.

### Parametri di configurazione

| Parametro | Alias | Tipo | Default | Descrizione |
|-----------|-------|------|---------|-------------|
| `--mode` | `-m` | string | `all` | Modalità di esecuzione: `all`, `check-feedback`, `get-attachments`, `retrieve-attachments`, `retrieve-glacier`, `validate-pdf`, `fetch-timelines` |
| `--aws.profile` | `-p`, `--profile` | string | - | Nome del profilo AWS SSO |
| `--envName` | `-e` | string | - | Nome dell'ambiente (`dev`, `uat`, `test`, `prod`, `hotfix`) |
| `--inputFile` | `-f`, `--input` | string | - | Percorso del file di input contenente IUN o requestId |
| `--bucket` | `-b` | string | - | Nome del bucket S3 |
| `--restore` | `-r` | boolean | `false` | Abilita il ripristino per allegati e marker di cancellazione |
| `--outputDir` | `-o` | string | `./results` | Directory di output per i report e CSV di risultato |
| `--glacier.expirationDays` | - | number | `30` | Giorni di disponibilità per i documenti ripristinati da Glacier |
| `--glacier.tier` | - | string | `Bulk` | Velocità di ripristino Glacier (`Bulk`, `Standard`, `Expedited`) |
| `--pdfValidation.concurrency` | - | number | `100` | Richieste S3 concorrenti per la validazione dei PDF |
| `--pdfValidation.batchSize` | - | number | `1000` | Dimensione dei batch di chiavi S3 per la validazione |
| `--pdfValidation.dryRun` | - | boolean | `false` | Esegue la simulazione della validazione PDF |

## Utilizzo

### Esecuzione della pipeline completa

Per eseguire la verifica e l'analisi completa di tutti gli step:

```bash
pnpm --filter=send-paper-request-error-check dev --inputFile ./requestIds.txt --envName dev
```

### Esecuzione modulare di un singolo step

È possibile eseguire un singolo modulo specificando il parametro `--mode`:

```bash
# Esempio: Verifica feedback analogico
pnpm --filter=send-paper-request-error-check dev --mode check-feedback --inputFile ./requestIds.txt --envName dev

# Esempio: Ripristino allegati da notifiche
pnpm --filter=send-paper-request-error-check dev --mode get-attachments --inputFile ./iuns.txt --restore --envName dev

# Esempio: Validazione PDF su S3
pnpm --filter=send-paper-request-error-check dev --mode validate-pdf --inputFile ./filekeys.txt --bucket pn-safestorage-eu-south-1-123456789 --envName dev
```
