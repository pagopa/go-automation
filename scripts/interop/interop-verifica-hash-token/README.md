# Interop Verifica Hash Token

> Versione: 1.0.0 | Autore: Team GO - Gestione Operativa

Script per la verifica dell'integrità e dell'hash dei token per l'allarme `interop-be-audit-signer`.

## Indice

- [Funzionalità](#funzionalità)
- [Prerequisiti](#prerequisiti)
- [Configurazione](#configurazione)
- [Utilizzo](#utilizzo)
- [Output e Risultati](#output-e-risultati)
- [Troubleshooting](#troubleshooting)

---

## Funzionalità

Lo script automatizza il flusso di verifica dell'integrità dei token firmati:

1. **Ricerca CID**: Esegue una prima query su CloudWatch Logs per estrarre il Correlation ID (`CID`) associato a errori
   specifici dell'applicazione `interop-be-audit-signer` nell'intervallo temporale impostato.
2. **Identificazione File**: Esegue una seconda query CloudWatch filtrata per il `CID` trovato, identificando il nome
   del file del token registrato.
3. **Download da S3**: Scarica da Amazon S3 sia il file token originale (`.ndjson`) sia quello firmato PKCS#7 (`.p7m`).
4. **Verifica e Decrittografia**: Valida ed estrae il file originale firmato `.p7m` tramite la libreria `node-forge` e
   decompressione del file ZIP risultante.
5. **Verifica dell'Hash**: Calcola l'hash SHA-256 di entrambi i file tramite streaming Node.js e li confronta per
   validarne la corrispondenza e l'integrità.

---

## Prerequisiti

### Software Richiesto

| Software | Versione Minima | Note                                                                                     |
|----------|-----------------|------------------------------------------------------------------------------------------|
| Node.js  | >= 22.14.0      | Versione LTS del monorepo                                                                |
| pnpm     | >= 10.28.0      | Package manager                                                                          |

### Account e Permessi AWS

- Profilo AWS SSO configurato localmente.
- Permessi di lettura per il gruppo di log CloudWatch configurato (`logs:StartQuery`, `logs:GetQueryResults`).
- Permessi di lettura (`s3:GetObject`) per i bucket S3 contenenti i file `.ndjson` e `.p7m`.

Eseguire il login sul profilo AWS opportuno prima di lanciare lo script:

```bash
aws sso login --profile <nome-profilo>
```

---

## Configurazione

Lo script supporta la configurazione flessibile tramite parametri CLI, variabili d'ambiente e file di
configurazione/presets.

### Parametri CLI e Variabili d'Ambiente

| Parametro CLI             | Alias | Variabile d'Ambiente    | Obbligatorio | Default         | Descrizione                                                                                          |
|---------------------------|-------|-------------------------|--------------|-----------------|------------------------------------------------------------------------------------------------------|
| `--aws-profile`           | `-ap` | -                       | **Sì**       | -               | Nome del profilo AWS SSO                                                                             |
| `--aws-region`            | `-ar` | -                       | No           | `eu-south-1`    | Regione AWS                                                                                          |
| `--cw-log-group`          | `-lg` | `CW_LOG_GROUP`          | **Sì**       | -               | Log group di CloudWatch                                                                              |
| `--cw-query-application`  | `-qa` | `CW_QUERY_APPLICATION`  | **Sì**       | -               | Query CloudWatch iniziale per recupero del CID                                                       |
| `--cw-query-cid`          | `-qc` | `CW_QUERY_CID`          | **Sì**       | -               | Query CloudWatch per recuperare il nome del file tramite CID (contiene il placeholder `cid_replace`) |
| `--s3-bucket-name-ndjson` | `-bn` | `S3_BUCKET_NAME_NDJSON` | **Sì**       | -               | Nome bucket S3 per file NDJSON originali                                                             |
| `--s3-prefix-ndjson`      | `-pn` | `S3_PREFIX_NDJSON`      | No           | `token-details` | Prefisso S3 per file NDJSON                                                                          |
| `--s3-bucket-name-p7m`    | `-bp` | `S3_BUCKET_NAME_P7M`    | **Sì**       | -               | Nome bucket S3 per file P7M firmati                                                                  |
| `--s3-prefix-p7m`         | `-pp` | `S3_PREFIX_P7M`         | No           | `token-details` | Prefisso S3 per file P7M                                                                             |
| `--start-utc`             | `-su` | `START_UTC`             | **Sì**       | -               | Data d'inizio in UTC (`YYYY-MM-DD HH:MM:SS` o ISO 8601)                                              |
| `--end-utc`               | `-eu` | `END_UTC`               | **Sì**       | -               | Data di fine in UTC (`YYYY-MM-DD HH:MM:SS` o ISO 8601)                                               |

### Preset di Configurazione (Consigliato)

È possibile raggruppare i parametri ripetitivi all'interno del file di preset locale in `configs/presets.yaml`. Ad
esempio, è già presente un preset denominato `test`:

```yaml
test:
  aws.region: 'eu-south-1'
  cw.logGroup: '/aws/eks/interop-eks-cluster-test/application'
  cw.queryApplication: |
    fields @timestamp, @message
    | sort @timestamp asc
    | filter (@message like /ERROR/ or stream = "stderr") and (@message like "Request failed with status code 500" or @message like "Request failed with status code 503") and @message like "[CID="
    | filter @logStream not like /adot-collector/
    | filter pod_app like /interop-be-audit-signer/
    | limit 1
  cw.queryCid: |
    fields @timestamp, @message
    | sort @timestamp asc
    | parse @message "[CID=*]" as CID
    | filter CID = cid_replace
    | display @message
    | limit 10
  s3.bucketNameNdjson: 'interop-generated-jwt-details-test-es1'
  s3.prefixNdjson: 'token-details'
  s3.bucketNameP7m: 'interop-signed-jwt-audit-v2-test-es1'
  s3.prefixP7m: 'token-details'
  startUtc: '2026-07-13 13:30:00'
  endUtc: '2026-07-13 13:40:00'
```

---

## Utilizzo

### Sviluppo (Esecuzione diretta in TS)

Dalla root del monorepo, lanciare lo script utilizzando il preset configurato:

```bash
pnpm interop:verifica:hash:token:dev -- --script-preset-name test --aws-profile <tuo-profilo-aws>
```

Oppure specificando i singoli parametri manualmente via CLI:

```bash
pnpm interop:verifica:hash:token:dev -- \
  --aws-profile pdnd-interop-test \
  --cw-log-group "/aws/eks/interop-eks-cluster-test/application" \
  --cw-query-application "fields @timestamp, @message
| sort @timestamp asc
| filter (@message like /ERROR/ or stream = "stderr") and (@message like "Request failed with status code 500" or @message like "Request failed with status code 503") and @message like "[CID="
| filter @logStream not like /adot-collector/
| filter pod_app like /interop-be-audit-signer/
| limit 1" \
  --cw-query-cid "fields @timestamp, @message
| sort @timestamp asc
| parse @message "[CID=*]" as CID
| filter CID = cid_replace
| display @message
| limit 10" \
  --s3-bucket-name-ndjson "interop-generated-jwt-details-test-es1" \
  --s3-bucket-name-p7m "interop-signed-jwt-audit-v2-test-es1" \
  --start-utc "2026-07-13 13:30:00" \
  --end-utc "2026-07-13 13:40:00"
```

### Produzione (Compilazione + Node.js)

Compilare prima lo script:

```bash
pnpm --filter=interop-verifica-hash-token build
```

Eseguire lo script compilato:

```bash
node dist/index.js --script-preset-name test --aws-profile <profilo>
```

---

## Output e Risultati

### File Generati

Durante l'esecuzione, lo script crea una cartella dedicata per l'output in:
`data/interop-verifica-hash-token/outputs/interop-verifica-hash-token_{timestamp}/`

Al suo interno vengono scaricati ed estratti i seguenti file per le verifiche:

1. `token1.ndjson.zip.p7m` - Il file firmato PKCS#7 originale scaricata da S3.
2. `token1.ndjson.zip` - L'archivio ZIP estratto dalla firma DER.
3. `token_original.ndjson` - Il file JSON originale scaricato da S3 per il confronto.
4. L'NDJSON estratto dallo ZIP (es. `token1.ndjson`), utilizzato per la computazione dell'hash finale.
5. `execution.log` - File di log dettagliato dell'esecuzione (generato automaticamente da `GOScript`).

### Esempio Output Console

```text
Interop Verifica Hash Token 1.0.0
Verifica hash dei token per l'allarme interop-be-audit-signer

> Starting Interop Verifica Hash Token
  Config: { ... }

> Executing first CloudWatch query...
  [SPINNER] Running CloudWatch query for application logs...
  Extracted Correlation ID (CID): 12345678-abcd-1234-abcd-1234567890ab

> Executing second CloudWatch query...
  [SPINNER] Running CloudWatch query for CID 12345678-abcd-1234-abcd-1234567890ab...
  Extracted filename base: token-details/7db928cf-2b81-42e6-a05c-dfb7c2512f45

> Downloading files from S3...
  - S3 Bucket (P7M): interop-signed-jwt-audit-v2-test-es1
  - S3 Key (P7M): token-details/7db928cf-2b81-42e6-a05c-dfb7c2512f45.ndjson.zip.p7m
  [SPINNER] Downloading P7M file...
  Downloaded signed P7M to: C:\Users\...\data\interop-verifica-hash-token\outputs\...\token1.ndjson.zip.p7m
  - S3 Bucket (NDJSON): interop-generated-jwt-details-test-es1
  - S3 Key (NDJSON): token-details/7db928cf-2b81-42e6-a05c-dfb7c2512f45.ndjson
  [SPINNER] Downloading NDJSON file...
  Downloaded original NDJSON to: C:\Users\...\data\interop-verifica-hash-token\outputs\...\token_original.ndjson

> Unpacking and extracting .p7m file...
  [SPINNER] Decrypting and unzipping...
  Extracted signed NDJSON content to: C:\Users\...\data\interop-verifica-hash-token\outputs\...\token1.ndjson

> Verifying SHA-256 hashes...
  [SPINNER] Calculating hashes...
  Extracted file hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  Original file hash:  e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  [OK] Hash verification successful! The token content matches.

[OK] Script completed successfully
```

---

## Troubleshooting

### Errore: `AccessDeniedException` o credenziali non valide

**Causa**: La sessione AWS SSO è scaduta o non si dispone di permessi IAM sufficienti sui log o sui bucket S3.

**Soluzione**:
Effettuare nuovamente il login SSO specificando il profilo corretto:

```bash
aws sso login --profile <tuo-profilo>
```

Se il problema persiste, verificare con l'amministratore AWS i permessi sui log CloudWatch e sui bucket S3 specificati.
