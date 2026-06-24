# Send Upload Attachments

> Versione: 1.0.0 | Autore: Team GO - Gestione Operativa

Carica uno o più file su SafeStorage (canale PN `/delivery/attachments/preload` + presigned URL), pilotato da un file di input. Genera un file di output con tutti i dati di input più le informazioni ottenute dal caricamento (key, versionToken, sha256, ecc.), scritto **incrementalmente** riga per riga e nello stesso ordine dell'input.

## Indice

- [Funzionalità](#funzionalità)
- [Prerequisiti](#prerequisiti)
- [Configurazione](#configurazione)
- [File di Input](#file-di-input)
- [File di Output](#file-di-output)
- [Utilizzo](#utilizzo)
- [Troubleshooting](#troubleshooting)

## Funzionalità

- Input **sempre** da file (nessun parametro per singolo file): formati supportati `csv`, `json`, `jsonl`
- Upload parallelo con concorrenza configurabile (`--concurrency`)
- Content type per riga, inferito dall'estensione (`.pdf`, `.json`) o da `--default-content-type`
- Output incrementale: ogni riga viene scritta appena il caricamento termina, in ordine di input
- Le righe in errore finiscono comunque nell'output, con il messaggio preciso nel campo `error`
- `--skip-on-error`: `true` prosegue con i file successivi, `false` (default) si ferma al primo errore (gli upload in corso vengono completati e riportati nell'output)

## Prerequisiti

| Software   | Versione Minima | Note                 |
| ---------- | --------------- | -------------------- |
| Node.js    | >= 18.0.0       | LTS consigliata      |
| pnpm       | >= 8.0.0        | Package manager      |
| TypeScript | >= 5.0.0        | Incluso nel progetto |

Serve inoltre una **API Key PN** valida per l'ambiente di destinazione (dev/uat/prod). Non sono richieste credenziali AWS.

## Configurazione

### Parametri CLI

| Parametro                | Alias | Tipo   | Obbligatorio | Default                      | Descrizione                                                           |
| ------------------------ | ----- | ------ | ------------ | ---------------------------- | --------------------------------------------------------------------- |
| `--input-file`           | `-i`  | STRING | Sì           | -                            | Path del file di input (csv, json o jsonl)                            |
| `--output-file`          | `-o`  | STRING | No           | `<input>-results.<formato>`  | Path del file di output                                               |
| `--output-format`        | -     | STRING | No           | da estensione output o input | Formato di output: `csv`, `json`, `jsonl`                             |
| `--base-path`            | `-b`  | STRING | Sì           | -                            | Base URL del servizio PN (es. `api.dev.notifichedigitali.it`)         |
| `--pn-api-key`           | `-k`  | STRING | Sì           | -                            | API Key per autenticazione PN (sensibile)                             |
| `--skip-on-error`        | `-s`  | BOOL   | No           | `false`                      | `true`: prosegue in caso di errore; `false`: si ferma al primo errore |
| `--concurrency`          | `-n`  | INT    | No           | `3`                          | Numero di file caricati in parallelo                                  |
| `--default-content-type` | -     | STRING | No           | -                            | Content type quando non specificato e non inferibile dall'estensione  |
| `--proxy-url`            | -     | STRING | No           | -                            | URL del proxy HTTP per debugging (es. `http://127.0.0.1:9090`)        |
| `--debug`                | -     | BOOL   | No           | `false`                      | Abilita il logging di debug delle chiamate HTTP                       |

### Priorità di Configurazione

1. Parametri CLI (priorità massima)
2. File di configurazione (`configs/config.json` / `config.yaml`)
3. Variabili d'ambiente (`.env`)
4. Valori di default

## File di Input

Ogni riga/oggetto descrive un file da caricare. Campi riconosciuti:

| Campo         | Obbligatorio | Descrizione                                                        |
| ------------- | ------------ | ------------------------------------------------------------------ |
| `filePath`    | Sì           | Path locale del file da caricare                                   |
| `contentType` | No           | MIME type; se assente è inferito dall'estensione (`.pdf`, `.json`) |

> **Nota**: l'API PN (`POST /delivery/attachments/preload`) accetta solo `application/pdf` e `application/json`; altri content type vengono rifiutati con `400`.

Tutti gli altri campi/colonne sono **passthrough**: vengono copiati così come sono nel file di output.

### Esempio CSV (`data/files.csv`)

```csv
filePath,contentType,pratica
/docs/atto-001.pdf,,PRA-001
/docs/atto-002.pdf,application/pdf,PRA-002
/docs/f24-001.json,,PRA-003
```

### Esempio JSON (`data/files.json`)

```json
[
  { "filePath": "/docs/atto-001.pdf", "pratica": "PRA-001" },
  { "filePath": "/docs/f24-001.json", "contentType": "application/json", "pratica": "PRA-003" }
]
```

### Esempio JSONL (`data/files.jsonl`)

```jsonl
{"filePath":"/docs/atto-001.pdf","pratica":"PRA-001"}
{"filePath":"/docs/atto-002.pdf","pratica":"PRA-002"}
```

## File di Output

Una riga/oggetto per ogni riga di input (anche per quelle fallite), nello stesso ordine dell'input: prima tutti i campi di input, poi i campi generati.

| Campo           | Descrizione                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| `status`        | `uploaded` oppure `failed`                                                                              |
| `fileKey`       | Key SafeStorage del file caricato (vuoto se fallito)                                                    |
| `versionToken`  | Version token del documento, dall'header `x-amz-version-id` della risposta di upload (vuoto se fallito) |
| `sha256`        | Digest SHA256 (base64) del contenuto (vuoto se fallito)                                                 |
| `fileSizeBytes` | Dimensione del file in byte (vuoto se fallito)                                                          |
| `contentType`   | MIME type usato per l'upload (vuoto se fallito)                                                         |
| `uploadedAt`    | Timestamp ISO 8601 del caricamento (vuoto se fallito)                                                   |
| `error`         | Messaggio di errore preciso (vuoto se caricato con successo)                                            |

Note:

- I campi generati **vincono** su eventuali colonne di input con lo stesso nome (es. una colonna di input `status` viene sovrascritta).
- Con input JSONL eterogeneo (oggetti con chiavi diverse tra le righe) e output CSV, l'intestazione è derivata dalla prima riga: preferire output `jsonl` in quel caso.

## Utilizzo

### Modalità Development (via pnpm/tsx)

```bash
# Dalla root del monorepo
pnpm send:upload:attachments:dev -- \
  --input-file data/files.csv \
  --base-path api.dev.notifichedigitali.it \
  --pn-api-key <api-key> \
  -n 5 -s true

# Output JSON con nome custom
pnpm send:upload:attachments:dev -- \
  -i data/files.csv -o results.json \
  -b api.dev.notifichedigitali.it -k <api-key>
```

### Modalità Production (build + node)

```bash
pnpm --filter=send-upload-attachments build
pnpm --filter=send-upload-attachments start -- -i data/files.csv -b <base-path> -k <api-key>
```

### Exit code

- `0`: workflow completato (anche con righe fallite se `--skip-on-error=true`; controllare il riepilogo e il campo `error` dell'output)
- `1`: stop al primo errore (`--skip-on-error=false`), errore fatale di lettura input o di scrittura output

## Troubleshooting

#### Errore: `Cannot determine content type for '<file>'`

**Causa**: estensione non riconosciuta (diversa da `.pdf`/`.json`) e nessun `contentType` nella riga.

**Soluzione**: aggiungere la colonna/campo `contentType` alla riga oppure usare `--default-content-type`.

#### Errore: `missing or empty 'filePath'`

**Causa**: riga di input senza il campo `filePath`.

**Soluzione**: correggere il file di input; con `--skip-on-error=true` la riga viene saltata e riportata nell'output.

#### Errore: "Module not found"

**Causa**: dipendenze non installate o build non eseguito.

**Soluzione**:

```bash
pnpm install
pnpm build:common
pnpm --filter=@go-automation/go-send build
pnpm --filter=send-upload-attachments build
```

### Debug Mode

```bash
# Ispezione del traffico HTTP via proxy (es. Proxyman)
pnpm send:upload:attachments:dev -- ... --proxy-url http://127.0.0.1:9090

# Type check senza build
pnpm --filter=send-upload-attachments exec tsc --noEmit
```

---

**Ultima modifica**: 2026-06-10
**Maintainer**: Team GO - Gestione Operativa
