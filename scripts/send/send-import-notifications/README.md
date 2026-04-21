# SEND Import Notifications

> Versione: 1.0.0 | Autore: Team GO - Gestione Operativa

Script di importazione massiva notifiche SEND da file CSV con upload automatico documenti, invio notifiche via API PN (Piattaforma Notifiche) e polling per ottenimento IUN.

## Indice

- [Funzionalità](#funzionalità)
- [Prerequisiti](#prerequisiti)
- [Configurazione](#configurazione)
- [Utilizzo](#utilizzo)
- [Formato CSV](#formato-csv)
- [Docker](#docker)
- [Troubleshooting](#troubleshooting)

## Funzionalità

- **Import CSV massivo**: Lettura file CSV con notifiche da inviare
- **Upload documenti automatico**: Caricamento automatico dei documenti allegati su storage PN
- **Invio notifiche parallelo**: Invio concorrente configurabile per alte performance
- **Polling IUN**: Attesa automatica per ottenimento codice IUN (Identificativo Univoco Notifica)
- **Export risultati**: Generazione CSV con IUN e stato di ogni notifica
- **Modalità dry-run**: Validazione senza invio effettivo
- **Supporto streaming**: Gestione efficiente file CSV di grandi dimensioni
- **Preservazione colonne**: Possibilita di mantenere tutte le colonne originali nel CSV di output
- **Supporto Docker**: Containerizzazione completa per deployment

## Prerequisiti

### Software Richiesto

| Software   | Versione Minima | Note                     |
| ---------- | --------------- | ------------------------ |
| Node.js    | >= 18.0.0       | LTS consigliata (v24+)   |
| pnpm       | >= 8.0.0        | Package manager          |
| TypeScript | >= 5.0.0        | Incluso nel progetto     |
| Docker     | >= 20.0         | Opzionale, per container |

### Account e Permessi PN

- Account sulla Piattaforma Notifiche (ambiente test o produzione)
- API Key valida per l'ente mittente
- Permessi per:
  - Upload documenti (presigned URL)
  - Creazione notifiche
  - Lettura stato notifiche

### Formato File CSV

Il CSV di input deve seguire il formato QA Test (vedi sezione [Formato CSV](#formato-csv)).

## Configurazione

### Parametri CLI

I parametri sono definiti internamente con il punto come separatore (es. `csv.file`) ma sulla riga di comando vanno passati con il trattino (es. `--csv-file`). Il framework GOScript effettua la conversione automaticamente.

#### Input/Output

| Parametro       | Alias | Tipo   | Obbligatorio | Default | Descrizione          |
| --------------- | ----- | ------ | ------------ | ------- | -------------------- |
| `--csv-file`    | `-c`  | string | Si           | -       | Path file CSV input  |
| `--export-file` | `-e`  | string | No           | -       | Path file CSV output |

#### Connessione PN

| Parametro      | Alias | Tipo   | Obbligatorio | Default | Descrizione     |
| -------------- | ----- | ------ | ------------ | ------- | --------------- |
| `--base-path`  | `-b`  | string | Si           | -       | Base URL API PN |
| `--pn-api-key` | `-k`  | string | Si           | -       | API Key PN      |

#### Comportamento

| Parametro              | Alias | Tipo    | Obbligatorio | Default | Descrizione                       |
| ---------------------- | ----- | ------- | ------------ | ------- | --------------------------------- |
| `--send-notifications` | `-s`  | boolean | No           | `false` | Invia notifiche (false = dry-run) |
| `--concurrency`        | `-n`  | int     | No           | `3`     | Parallelismo invio                |

#### Polling IUN

| Parametro             | Alias | Tipo    | Obbligatorio | Default | Descrizione              |
| --------------------- | ----- | ------- | ------------ | ------- | ------------------------ |
| `--poll-for-iun`      | `-p`  | boolean | No           | `true`  | Attiva polling IUN       |
| `--poll-max-attempts` | -     | int     | No           | `8`     | Tentativi max polling    |
| `--poll-delay-ms`     | -     | int     | No           | `30000` | Delay tra tentativi (ms) |

#### Streaming e Export

| Parametro                  | Alias                | Tipo    | Obbligatorio | Default | Descrizione                 |
| -------------------------- | -------------------- | ------- | ------------ | ------- | --------------------------- |
| `--streaming-threshold-mb` | -                    | int     | No           | `10`    | Soglia MB per streaming     |
| `--preserve-all-columns`   | `--preserve-columns` | boolean | No           | `true`  | Preserva colonne originali  |
| `--export-all-rows`        | -                    | boolean | No           | `false` | Esporta anche righe fallite |
| `--include-status-columns` | -                    | boolean | No           | `false` | Aggiungi colonne stato      |

#### Debug

| Parametro     | Alias | Tipo   | Obbligatorio | Default | Descrizione            |
| ------------- | ----- | ------ | ------------ | ------- | ---------------------- |
| `--proxy-url` | -     | string | No           | -       | URL proxy HTTP (debug) |

### Variabili d'Ambiente

| Variabile      | Descrizione  | Esempio                         |
| -------------- | ------------ | ------------------------------- |
| `PN_API_KEY`   | API Key PN   | `abc123...`                     |
| `PN_BASE_PATH` | Base URL API | `api.test.notifichedigitali.it` |
| `PROXY_URL`    | Proxy debug  | `http://127.0.0.1:9090`         |

### File di Configurazione

Percorso: `configs/.env`

```bash
# API Configuration
PN_API_KEY=your-api-key-here
PN_BASE_PATH=api.test.notifichedigitali.it

# Optional: Debug proxy
# PROXY_URL=http://127.0.0.1:9090
```

### Priorita di Configurazione

1. **Parametri CLI** (priorita massima)
2. **Variabili d'ambiente**
3. **File .env**

## Utilizzo

### Modalità Development (via pnpm/tsx)

```bash
# Dalla root del monorepo

# Dry-run (validazione senza invio)
pnpm --filter=send-import-notifications dev -- \
  --csv-file "./data/input.csv" \
  --base-path "api.test.notifichedigitali.it" \
  --pn-api-key "your-api-key"

# Invio effettivo con export
pnpm --filter=send-import-notifications dev -- \
  --csv-file "./data/input.csv" \
  --export-file "./data/output.csv" \
  --base-path "api.test.notifichedigitali.it" \
  --pn-api-key "your-api-key" \
  --send-notifications
```

### Modalità Production (build + node)

```bash
# Build
pnpm --filter=send-import-notifications build

# Esecuzione
pnpm --filter=send-import-notifications start -- \
  --csv-file "./data/input.csv" \
  --export-file "./data/output.csv" \
  --base-path "api.test.notifichedigitali.it" \
  --pn-api-key "your-api-key" \
  --send-notifications
```

### Shortcut dalla Root del Monorepo

Il `package.json` root espone comandi abbreviati:

```bash
# Development (tsx)
pnpm send:import:notifications:dev -- \
  --csv-file "./data/input.csv" \
  --base-path "api.test.notifichedigitali.it" \
  --pn-api-key "your-api-key"

# Production (build + node)
pnpm send:import:notifications:prod -- \
  --csv-file "./data/input.csv" \
  --base-path "api.test.notifichedigitali.it" \
  --pn-api-key "your-api-key" \
  --send-notifications

# Solo build
pnpm send:import:notifications:build
```

### Modalità Standalone

```bash
# Dalla directory dello script
cd scripts/send/send-import-notifications

# Esecuzione diretta
node dist/index.js \
  --csv-file "./data/input.csv" \
  --export-file "./data/output.csv" \
  --base-path "api.test.notifichedigitali.it" \
  --pn-api-key "your-api-key" \
  --send-notifications
```

### Esempi Pratici

```bash
# Dry-run per validazione CSV
pnpm send:import:notifications:dev -- \
  --csv-file "./test-notifications.csv" \
  --base-path "api.test.notifichedigitali.it" \
  --pn-api-key "$PN_API_KEY"

# Invio con alta concorrenza
pnpm send:import:notifications:dev -- \
  --csv-file "./notifications.csv" \
  --export-file "./results.csv" \
  --base-path "api.test.notifichedigitali.it" \
  --pn-api-key "$PN_API_KEY" \
  --send-notifications \
  --concurrency 5

# Invio senza polling IUN (più veloce)
pnpm send:import:notifications:dev -- \
  --csv-file "./notifications.csv" \
  --export-file "./results.csv" \
  --base-path "api.test.notifichedigitali.it" \
  --pn-api-key "$PN_API_KEY" \
  --send-notifications \
  --poll-for-iun false

# Export con tutte le righe e colonne di stato
pnpm send:import:notifications:dev -- \
  --csv-file "./notifications.csv" \
  --export-file "./results.csv" \
  --base-path "api.test.notifichedigitali.it" \
  --pn-api-key "$PN_API_KEY" \
  --send-notifications \
  --export-all-rows \
  --include-status-columns

# Con proxy per debug
pnpm send:import:notifications:dev -- \
  --csv-file "./notifications.csv" \
  --base-path "api.test.notifichedigitali.it" \
  --pn-api-key "$PN_API_KEY" \
  --send-notifications \
  --proxy-url "http://127.0.0.1:9090"

# Usando variabili d'ambiente
PN_API_KEY="your-key" \
PN_BASE_PATH="api.test.notifichedigitali.it" \
pnpm send:import:notifications:dev -- \
  --csv-file "./notifications.csv" \
  --export-file "./results.csv" \
  --send-notifications
```

## Formato CSV

### Formato QA Test (Input)

Il CSV di input deve seguire il formato QA Test con delimitatore virgola (`,`) e codifica UTF-8.

Le colonne attese sono:

| Colonna                     | Obbligatorio | Descrizione                                |
| --------------------------- | ------------ | ------------------------------------------ |
| `ID_Scenario`               | No           | Identificativo scenario test               |
| `Scenario`                  | Si           | Nome scenario (mappato a `subject`)        |
| `Prodotto`                  | No           | Tipo prodotto (es. "AR")                   |
| `Destinatario`              | Si           | Codice fiscale destinatario                |
| `Denomination`              | Si           | Nome/Ragione sociale destinatario          |
| `Indirizzo PEC`             | No           | PEC per domicilio digitale                 |
| `physicalCommunicationType` | No           | Tipo comunicazione (AR/890)                |
| `CAP`                       | Si           | Codice postale                             |
| `Provincia`                 | Si           | Sigla provincia                            |
| `Citta`                     | Si           | Nome citta                                 |
| `Stato`                     | No           | Stato (es. "IT", "ITALIA" normalizzato)    |
| `Range`                     | No           | Range test                                 |
| `Indirizzo`                 | Si           | Indirizzo fisico                           |
| `Sender`                    | Si           | PA mittente (denominazione)                |
| `Tax ID`                    | Si           | Codice fiscale PA mittente (`senderTaxId`) |

L'adapter QA Test applica le seguenti trasformazioni automatiche:

- **Mapping colonne**: le colonne CSV vengono mappate ai nomi standard SEND (es. `Scenario` -> `subject`, `Destinatario` -> `recipientTaxId`)
- **Valori default**: `recipientType` = `PF`, `documentKey`, `documentVersionToken`, `documentSha256` e `group` vengono impostati automaticamente
- **Normalizzazione**: il valore `ITALIA` nella colonna `Stato` viene convertito in stringa vuota (indirizzo domestico)
- **Domicilio digitale**: se `Indirizzo PEC` ha un valore, viene impostato automaticamente `digitalType = PEC`

### Esempio CSV Input

```csv
ID_Scenario,Scenario,Prodotto,Destinatario,Denomination,Indirizzo PEC,physicalCommunicationType,CAP,Provincia,Citta,Stato,Range,Indirizzo,Sender,Tax ID
1,Test AR,AR,RSSMRA80A01H501U,Mario Rossi,,AR,00100,RM,Roma,IT,,Via Roma 1,COMUNE DI TEST,01234567890
2,Test PEC,AR,12345678901,Azienda SRL,pec@azienda.it,890,20100,MI,Milano,IT,,Via Milano 2,COMUNE DI TEST,01234567890
```

### Formato CSV Output

Il CSV di output include le colonne originali (se `--preserve-all-columns` e attivo, default `true`) più le seguenti colonne generate:

| Colonna           | Descrizione                     |
| ----------------- | ------------------------------- |
| `RequestID`       | ID richiesta notifica           |
| `iun`             | Identificativo Univoco Notifica |
| `Data invio Test` | Timestamp invio                 |
| `Stato`           | Stato elaborazione              |
| `Esito`           | Esito (OK/KO)                   |
| `Note`            | Eventuali note/errori           |

Con `--include-status-columns`:

| Colonna         | Descrizione                    |
| --------------- | ------------------------------ |
| `_status`       | Stato interno workflow         |
| `_processedAt`  | Timestamp elaborazione         |
| `_errorMessage` | Messaggio errore (se presente) |

In caso di conflitto tra colonne originali e colonne generate, prevalgono le colonne generate (strategia `keep-generated`).

## Docker

### Build Immagine

```bash
# Dalla directory dello script
cd scripts/send/send-import-notifications

# Build con docker compose
pnpm docker:build

# Oppure manualmente dalla root monorepo
docker build -t send-import-notifications \
  -f scripts/send/send-import-notifications/Dockerfile .
```

### Struttura Directory Dati

```
data/send-import-notifications/
├── configs/          # File di configurazione runtime
│   └── .env          # Variabili ambiente
├── inputs/           # File CSV da processare
│   └── notifications.csv
└── outputs/          # Risultati
    └── results.csv   # CSV con IUN
```

### Configurazione Docker

Creare il file `.env.docker`:

```bash
# Copiare il template
cp .env.docker.example .env.docker

# Editare con i propri valori
vim .env.docker
```

Contenuto `.env.docker`:

```bash
# PN API Configuration (required)
PN_API_KEY=your-api-key-here

# Optional: Override base path
# PN_BASE_PATH=api.test.notifichedigitali.it

# Optional: Debug proxy
# PROXY_URL=http://host.docker.internal:9090

# Optional: Node.js memory settings (default: 4096MB)
# NODE_OPTIONS=--max-old-space-size=8192
```

### Esecuzione Docker

```bash
# Esecuzione standard
pnpm docker:run

# Dry-run
pnpm docker:dry-run

# Shell interattiva
pnpm docker:shell

# Visualizza log
pnpm docker:logs
```

### Docker Compose Diretto

```bash
# Run con parametri
docker compose run --rm app node dist/index.js \
  --csv-file "/app/data/send-import-notifications/inputs/notifications.csv" \
  --export-file "/app/data/send-import-notifications/outputs/results.csv" \
  --base-path "api.test.notifichedigitali.it" \
  --pn-api-key "$PN_API_KEY" \
  --send-notifications
```

### Servizio Dev con Docker Compose

Il file `docker-compose.yaml` include un servizio `dev` che monta l'intero monorepo e usa lo stage `build` del Dockerfile (con le devDependencies):

```bash
# Avvia il servizio dev
docker compose run --rm dev
```

### Variabili Docker

| Variabile      | Default                     | Descrizione               |
| -------------- | --------------------------- | ------------------------- |
| `NODE_ENV`     | `production`                | Ambiente Node             |
| `NODE_OPTIONS` | `--max-old-space-size=4096` | Memoria heap              |
| `TZ`           | `Europe/Rome`               | Timezone                  |
| `PN_API_KEY`   | -                           | API Key PN (obbligatoria) |
| `PN_BASE_PATH` | -                           | Override base URL         |
| `PROXY_URL`    | -                           | Proxy debug               |

### Risorse Container

Limiti configurati in `docker-compose.yaml`:

| Risorsa | Limite  | Reservation |
| ------- | ------- | ----------- |
| CPU     | 2 cores | 0.5 cores   |
| Memoria | 4 GB    | 512 MB      |

## Troubleshooting

### Problemi Comuni

#### Errore: "Invalid CSV format"

**Causa**: Colonne mancanti o formato non conforme.

**Soluzione**:

1. Verificare le colonne obbligatorie (vedi sezione [Formato CSV](#formato-csv))
2. Controllare il delimitatore (deve essere virgola `,`)
3. Verificare encoding (UTF-8)

#### Errore: "API Key invalid"

**Causa**: API Key non valida o scaduta.

**Soluzione**:

1. Verificare API Key in Piattaforma Notifiche
2. Controllare ambiente (test/prod) corretto
3. Rigenerare API Key se necessario

#### Errore: "Document upload failed"

**Causa**: Documento troppo grande o formato non supportato.

**Soluzione**:

1. Verificare dimensione documento (max 10 MB)
2. Verificare formato (PDF)
3. Controllare URL presigned non scaduto

#### Errore: "IUN polling timeout"

**Causa**: Troppo tempo per ottenere IUN.

**Soluzione**:

```bash
# Aumentare tentativi e delay
--poll-max-attempts 15 --poll-delay-ms 60000
```

#### Errore: "Network error"

**Causa**: Problemi connettivita o firewall.

**Soluzione**:

1. Verificare connessione internet
2. Controllare firewall/proxy aziendale
3. Usare `--proxy-url` per debug

#### Memory Heap Out of Memory

**Causa**: File CSV troppo grande.

**Soluzione**:

1. Aumentare memoria: `NODE_OPTIONS="--max-old-space-size=8192"`
2. Abbassare `--streaming-threshold-mb` per forzare streaming
3. Dividere il file in batch più piccoli

### Debug con Proxy

Per ispezionare le richieste HTTP:

1. Configurare un proxy locale (es. Proxyman, Charles)
2. Esportare certificato CA
3. Eseguire:

```bash
# Con certificato CA custom
NODE_EXTRA_CA_CERTS=/path/to/Proxyman.pem \
pnpm send:import:notifications:dev -- \
  --csv-file "./data/input.csv" \
  --base-path "api.test.notifichedigitali.it" \
  --pn-api-key "$PN_API_KEY" \
  --proxy-url "http://127.0.0.1:9090"
```

### Verifica Configurazione

```bash
# Dry-run per validare setup
pnpm send:import:notifications:dev -- \
  --csv-file "./test.csv" \
  --base-path "api.test.notifichedigitali.it" \
  --pn-api-key "$PN_API_KEY"
```

---

**Ultima modifica**: 2026-03-05
**Maintainer**: Team GO - Gestione Operativa
**Repository**: [go-automation](https://github.com/pagopa/go-automation)
