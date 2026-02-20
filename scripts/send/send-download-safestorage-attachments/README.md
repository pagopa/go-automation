# send-download-safestorage-attachments

> Versione: 2.0.0 | Autore: Team GO - Gestione Operativa

Scarica attachment da **Safe Storage** accedendo direttamente al bucket S3 tramite AWS SDK.

Il bucket viene individuato automaticamente listando i bucket S3 dell'account `confinfo` e selezionando quello il cui nome contiene `safestorage` (esclusi i bucket `staging`).

---

## Indice

- [Prerequisiti](#prerequisiti)
- [Modalità di input](#modalità-di-input)
- [Parametri](#parametri)
- [Utilizzo](#utilizzo)
- [Esempi pratici](#esempi-pratici)
- [Output](#output)
- [Configurazione tramite file](#configurazione-tramite-file)
- [Troubleshooting](#troubleshooting)

---

## Prerequisiti

### AWS SSO Login

Lo script richiede un profilo AWS con accesso in lettura al bucket Safe Storage nell'account `confinfo` dell'ambiente target.

```bash
# Development
aws sso login --profile sso_pn-confinfo-dev

# UAT
aws sso login --profile sso_pn-confinfo-uat

# Production
aws sso login --profile sso_pn-confinfo-prod
```

### File di input

Copiare il file di input nella cartella dedicata:

```
go-automation/data/send-download-safestorage-attachments/inputs/
```

---

## Modalità di input

Lo script supporta due formati di input selezionabili con `--input-mode`.

### `uri-list` — Lista di URI _(default)_

Un file di testo con **una URI Safe Storage per riga**.

- Righe vuote e commenti (`#`) vengono ignorati
- URI duplicate vengono deduplicate automaticamente
- Righe che non iniziano con `safestorage://` vengono saltate

**Esempio** (`inputs/uris.txt`):

```
# Attachment relativi a IUN JPRE-XLEQ-WDAT-202602-A-1
safestorage://PN_EXTERNAL_LEGAL_FACTS-e57967d0d0a142bfa3a0b5d2db3053f3.bin
safestorage://PN_EXTERNAL_LEGAL_FACTS-1b42a9a3d9084a4b88a3a89c3acd7f71.bin
safestorage://PN_EXTERNAL_LEGAL_FACTS-c0ffcc4d7671408f9998a10456fde9e6.bin
```

**Output generato:**

```
outputs/send-download-safestorage-attachments_2026-02-20T11-30-00/
├── PN_EXTERNAL_LEGAL_FACTS-e57967d0d0a142bfa3a0b5d2db3053f3.bin
├── PN_EXTERNAL_LEGAL_FACTS-1b42a9a3d9084a4b88a3a89c3acd7f71.bin
├── PN_EXTERNAL_LEGAL_FACTS-c0ffcc4d7671408f9998a10456fde9e6.bin
└── download-report.jsonl
```

---

### `jsonl` — File JSONL strutturato

Un file JSONL (una riga = un record JSON) tipicamente prodotto da `send-fetch-dynamodb-data`.

Lo script estrae gli attachment da `items[].eventsList[].paperProgrStatus.attachments[]`. Il campo `keyValue` di ogni record viene usato come **nome della sotto-cartella** in cui vengono salvati i file di quel record. Gli attachment con array vuoto vengono ignorati.

**Esempio di riga JSONL:**

```json
{
  "keyValue": "PREPARE_ANALOG_DOMICILE.IUN_JPRE-XLEQ-WDAT-202602-A-1.RECINDEX_0.ATTEMPT_0",
  "items": [
    {
      "eventsList": [
        {
          "paperProgrStatus": {
            "attachments": [],
            "status": "booked"
          }
        },
        {
          "paperProgrStatus": {
            "attachments": [
              {
                "date": "2026-02-12T14:05:44Z",
                "id": "0",
                "sha256": "ecjD86tKrrE8Ln4bAqPdJtZyAHUnD+m5GVEWPdz960Y=",
                "documentType": "Affido conservato",
                "uri": "safestorage://PN_EXTERNAL_LEGAL_FACTS-e57967d0d0a142bfa3a0b5d2db3053f3.bin"
              }
            ],
            "status": "CON020"
          }
        },
        {
          "paperProgrStatus": {
            "attachments": [
              {
                "date": "2026-02-12T14:10:20Z",
                "id": "0",
                "sha256": "X97OEZudJwBbl4Icwf1eCUPeAqBGWt2TATB6mdYmBjE=",
                "documentType": "Distinta Elettronica Sigillata",
                "uri": "safestorage://PN_EXTERNAL_LEGAL_FACTS-c0ffcc4d7671408f9998a10456fde9e6.bin"
              }
            ],
            "status": "CON011"
          }
        }
      ]
    }
  ]
}
```

**Output generato** (una sotto-cartella per ogni `keyValue`):

```
outputs/send-download-safestorage-attachments_2026-02-20T11-30-00/
├── PREPARE_ANALOG_DOMICILE.IUN_JPRE-XLEQ-WDAT-202602-A-1.RECINDEX_0.ATTEMPT_0/
│   ├── PN_EXTERNAL_LEGAL_FACTS-e57967d0d0a142bfa3a0b5d2db3053f3.bin
│   └── PN_EXTERNAL_LEGAL_FACTS-c0ffcc4d7671408f9998a10456fde9e6.bin
├── PREPARE_ANALOG_DOMICILE.IUN_ABCD-EFGH-IJKL-202602-B-2.RECINDEX_1.ATTEMPT_0/
│   └── PN_EXTERNAL_LEGAL_FACTS-7ebfa8ea96d84e0a99f22935933785d1.bin
└── download-report.jsonl
```

---

## Parametri

| Parametro           | Alias   | Obbligatorio | Default    | Descrizione                                                              |
| ------------------- | ------- | :----------: | ---------- | ------------------------------------------------------------------------ |
| `--input-file`      | `-i`    |      ✓       | —          | File di input (relativo a `inputs/` oppure path assoluto)                |
| `--input-mode`      | `-m`    |      —       | `uri-list` | Formato del file: `uri-list` oppure `jsonl`                              |
| `--aws-profile`     | `-p`    |      ✓       | —          | AWS SSO profile con accesso al bucket Safe Storage dell'account confinfo |
| `--file-extensions` | `--ext` |      —       | _(tutti)_  | Filtra per estensione: lista separata da virgola, es. `pdf,txt,bin`      |

---

## Utilizzo

### Produzione _(consigliato)_

```bash
pnpm send:download:safestorage:attachments:prod \
  --input-file <file> \
  --input-mode <uri-list|jsonl> \
  --aws-profile <profile>
```

### Development _(no build, usa tsx)_

```bash
pnpm send:download:safestorage:attachments:dev \
  --input-file <file> \
  --input-mode <uri-list|jsonl> \
  --aws-profile <profile>
```

---

## Esempi pratici

### Download da lista di URI in DEV

```bash
aws sso login --profile sso_pn-confinfo-dev

pnpm send:download:safestorage:attachments:prod \
  --input-file uris.txt \
  --aws-profile sso_pn-confinfo-dev
```

### Download filtrando solo i PDF

```bash
pnpm send:download:safestorage:attachments:prod \
  --input-file dynamodb-export.jsonl \
  --input-mode jsonl \
  --aws-profile sso_pn-confinfo-prod \
  --file-extensions pdf
```

### Download filtrando più estensioni

```bash
pnpm send:download:safestorage:attachments:prod \
  --input-file dynamodb-export.jsonl \
  --input-mode jsonl \
  --aws-profile sso_pn-confinfo-prod \
  --file-extensions "pdf,txt,bin"
```

### Download da export DynamoDB in PROD

L'input è tipicamente l'output del script `send-fetch-dynamodb-data`.

```bash
aws sso login --profile sso_pn-confinfo-prod

# Copiare il file nella cartella inputs
cp /path/to/dynamodb-export.jsonl \
   data/send-download-safestorage-attachments/inputs/

pnpm send:download:safestorage:attachments:prod \
  --input-file dynamodb-export.jsonl \
  --input-mode jsonl \
  --aws-profile sso_pn-confinfo-prod
```

### Path assoluto per il file di input

Se il file si trova fuori dalla cartella `inputs/` è possibile passare un path assoluto:

```bash
pnpm send:download:safestorage:attachments:prod \
  --input-file /tmp/my-attachments.jsonl \
  --input-mode jsonl \
  --aws-profile sso_pn-confinfo-uat
```

---

## Output

### Cartella di esecuzione

I file vengono salvati in una cartella con timestamp univoco:

```
go-automation/data/send-download-safestorage-attachments/outputs/
└── send-download-safestorage-attachments_{timestamp}/
    ├── {keyValue}/                        ← solo in modalità jsonl
    │   └── PN_EXTERNAL_LEGAL_FACTS-*.bin
    ├── PN_EXTERNAL_LEGAL_FACTS-*.bin      ← solo in modalità uri-list
    └── download-report.jsonl
```

### Report JSONL

Al termine viene generato `download-report.jsonl`. Ogni riga è il risultato di un singolo download.

**Download riuscito:**

```json
{
  "uri": "safestorage://PN_EXTERNAL_LEGAL_FACTS-e579...f3.bin",
  "key": "PN_EXTERNAL_LEGAL_FACTS-e579...f3.bin",
  "outputPath": "/.../.../PN_EXTERNAL_LEGAL_FACTS-e579...f3.bin",
  "success": true,
  "documentType": "Affido conservato",
  "sha256": "ecjD86tK...",
  "keyValue": "PREPARE_ANALOG_DOMICILE.IUN_JPRE-..."
}
```

**Download fallito:**

```json
{
  "uri": "safestorage://PN_EXTERNAL_LEGAL_FACTS-xyz.bin",
  "key": "PN_EXTERNAL_LEGAL_FACTS-xyz.bin",
  "success": false,
  "error": "NoSuchKey: The specified key does not exist."
}
```

---

## Configurazione tramite file

In alternativa ai parametri CLI, è possibile usare un file `config.yaml`:

```
go-automation/data/send-download-safestorage-attachments/configs/config.yaml
```

```yaml
input:
  file: dynamodb-export.jsonl
  mode: jsonl
aws:
  profile: sso_pn-confinfo-prod
```

> I parametri CLI hanno sempre la precedenza sul file di configurazione.

---

## Troubleshooting

| Errore                              | Causa                                                    | Soluzione                                                         |
| ----------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| `Safe Storage bucket not found`     | Profilo sbagliato o senza accesso all'account `confinfo` | Verificare il profilo e fare `aws sso login`                      |
| `ExpiredTokenException`             | Sessione SSO scaduta                                     | `aws sso login --profile <profile>`                               |
| `NoSuchKey`                         | La chiave non esiste nel bucket                          | Verificare la URI e che il profilo punti all'environment corretto |
| `No Safe Storage attachments found` | Nessuna URI `safestorage://` trovata nel file            | Verificare che `--input-mode` corrisponda al formato del file     |
| `0 attachments` con file JSONL      | Tutti gli eventi hanno `attachments: []`                 | Normale: quegli eventi non hanno file allegati                    |

---

**Ultima modifica**: 2026-02-20
**Maintainer**: Team GO - Gestione Operativa
