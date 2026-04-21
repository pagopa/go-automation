# Send Fetch Timeline From Iun

> Versione: 1.0.0 | Autore: Team GO - Gestione Operativa

Script che legge una lista di IUN da file TXT, interroga DynamoDB sulla tabella `pn-Timelines` e salva in JSON la timeline completa di ogni notifica trovata.

## Indice

- [Funzionalità](#funzionalità)
- [Prerequisiti](#prerequisiti)
- [Configurazione](#configurazione)
- [Utilizzo](#utilizzo)
- [Output](#output)
- [Troubleshooting](#troubleshooting)

## Funzionalità

- **Import da file testo**: legge gli IUN da un file TXT, mantenendo righe vuote e spazi per poi normalizzarli in fase di parse.
- **Deduplicazione input**: scarta automaticamente duplicati esatti presenti nel file sorgente.
- **Supporto a più formati input**: accetta IUN semplici, IUN con date filter e IUN estratti da nomi file.
- **Query concorrenti verso DynamoDB**: interroga `pn-Timelines` in chunk da 10 richieste concorrenti.
- **Output JSON strutturato**: salva un array di risultati con `iun`, `paId`, `notificationSentAt` e `timeline`.
- **Summary finale**: mostra a console quanti IUN sono stati processati, quante timeline contengono dati e quante risultano vuote.

## Prerequisiti

### Software Richiesto

| Software | Versione Minima | Note                                    |
| -------- | --------------- | --------------------------------------- |
| Node.js  | >= 22.14.0      | Compatibile con gli engine del monorepo |
| pnpm     | >= 10.28.0      | Package manager del workspace           |
| AWS CLI  | >= 2.0          | Necessario per login SSO                |

### Accessi AWS

- Profilo AWS SSO con accesso in lettura a DynamoDB
- Permesso minimo richiesto: `dynamodb:Query` sulla tabella `pn-Timelines`

### Login AWS SSO

```bash
aws sso login --profile sso_pn-core-prod
aws sts get-caller-identity --profile sso_pn-core-prod
```

## Configurazione

### Parametri CLI

| Parametro            | Alias              | Tipo   | Obbligatorio | Default | Descrizione                               |
| -------------------- | ------------------ | ------ | ------------ | ------- | ----------------------------------------- |
| `--aws-profile`      | `--ap`             | string | Si           | -       | Profilo AWS SSO con accesso a DynamoDB    |
| `--source-file`      | `--sf`, `--input`  | string | Si           | -       | File TXT sorgente contenente gli IUN      |
| `--destination-file` | `--df`, `--output` | string | Si           | -       | File JSON di destinazione per i risultati |

### Variabili d'ambiente supportate

| Variabile          | Equivalente CLI      | Descrizione         |
| ------------------ | -------------------- | ------------------- |
| `AWS_PROFILE`      | `--aws-profile`      | Profilo AWS SSO     |
| `SOURCE_FILE`      | `--source-file`      | File di input       |
| `DESTINATION_FILE` | `--destination-file` | File JSON di output |

### Formato del file sorgente

Ogni riga del file può essere in uno di questi formati:

```text
IUN-SEMPLICE
IUN-SEMPLICE|2024-01-15
IUN_ABCD-1234-5678.RECINDEX_0.xml
```

Comportamento del parser:

- `IUN-SEMPLICE`: recupera tutta la timeline dell'IUN
- `IUN|YYYY-MM-DD`: recupera la timeline filtrando gli eventi con timestamp uguale o successivo alla data indicata
- `IUN_...RECINDEX...`: estrae automaticamente l'IUN dal nome file

### Risoluzione dei path

- `--source-file` assoluto: usato così com'è
- `--source-file` relativo: risolto in `data/send-fetch-timeline-from-iun/inputs/`
- `--destination-file` assoluto: usato così com'è
- `--destination-file` relativo: risolto in `data/send-fetch-timeline-from-iun/outputs/send-fetch-timeline-from-iun_<timestamp>/`

### File di configurazione opzionali

Il package non include un file di configurazione dedicato, ma GOScript supporta comunque i path standard:

- `data/send-fetch-timeline-from-iun/configs/config.json`
- `data/send-fetch-timeline-from-iun/configs/config.yaml`
- `data/send-fetch-timeline-from-iun/configs/.env`
- `scripts/send/send-fetch-timeline-from-iun/configs/config.json`
- `scripts/send/send-fetch-timeline-from-iun/configs/config.yaml`
- `scripts/send/send-fetch-timeline-from-iun/configs/.env`

## Utilizzo

### Modalità Development

```bash
pnpm send:fetch:timeline:from:iun:dev -- \
  --aws-profile sso_pn-core-prod \
  --source-file /tmp/iuns.txt \
  --destination-file /tmp/timelines.json
```

### Modalità Production

```bash
pnpm send:fetch:timeline:from:iun:build
pnpm send:fetch:timeline:from:iun:prod -- \
  --aws-profile sso_pn-core-prod \
  --source-file /tmp/iuns.txt \
  --destination-file /tmp/timelines.json
```

### Con file relativi gestiti da GOPaths

Supponendo:

- input in `data/send-fetch-timeline-from-iun/inputs/iuns.txt`
- output desiderato con nome `timelines.json`

```bash
pnpm send:fetch:timeline:from:iun:dev -- \
  --aws-profile sso_pn-core-prod \
  --source-file iuns.txt \
  --destination-file timelines.json
```

### Esempio file sorgente

```text
IUN-AAAA-BBBB-CCCC
IUN-DDDD-EEEE-FFFF|2024-01-15
IUN_GGGG-HHHH-IIII.RECINDEX_0.xml
```

## Output

### Console

Lo script mostra le tre fasi principali:

```text
Reading Input File
Found 125 unique IUNs

Fetching Timelines from DynamoDB
Processed 100/125 IUNs...
Retrieved 125 timelines

Writing Results
Results written to /tmp/timelines.json

Summary
Total IUNs processed: 125
Timelines with data: 118
Empty timelines: 7
```

### File JSON

Il file di output contiene un array di `SENDTimelineResult`:

```json
[
  {
    "iun": "ABCD-1234-5678",
    "paId": "pa-12345",
    "notificationSentAt": "2024-01-15T09:00:00.000Z",
    "timeline": [
      {
        "timelineElementId": "REQUEST_ACCEPTED",
        "category": "REQUEST_ACCEPTED",
        "timestamp": "2024-01-15T09:00:01.000Z"
      }
    ]
  }
]
```

### Log file

In esecuzione locale GOScript salva anche il log in:

```text
data/send-fetch-timeline-from-iun/outputs/send-fetch-timeline-from-iun_YYYY-MM-DDTHH-mm-ss/execution.log
```

## Troubleshooting

### `No IUNs found in input file`

**Causa**: il file sorgente e vuoto oppure contiene solo righe bianche.

**Soluzione**: verificare il contenuto del file di input.

### `ENOENT` / file di input non trovato

**Causa**: `--source-file` punta a un file inesistente.

**Soluzione**:

- usare un path assoluto corretto
- oppure spostare il file sotto `data/send-fetch-timeline-from-iun/inputs/`

### `ExpiredToken` / credenziali AWS scadute

```bash
aws sso login --profile sso_pn-core-prod
aws sts get-caller-identity --profile sso_pn-core-prod
```

### `Cannot find module '@go-automation/go-common'`

```bash
pnpm build:common
pnpm send:fetch:timeline:from:iun:build
```

### Verifica typecheck

```bash
pnpm --filter=send-fetch-timeline-from-iun exec tsc --noEmit
```

---

**Ultima modifica**: 2026-04-10
**Maintainer**: Team GO - Gestione Operativa
