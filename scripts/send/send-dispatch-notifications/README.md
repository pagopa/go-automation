# send-dispatch-notifications

Invio di notifiche SEND da un file CSV, JSON o JSONL, con due modalità:

- **`e2e`**: API B2B di SEND, con throttling a 20 chiamate/s, verifica dell'accettazione e recupero del `requestId` da `pn-Timelines`;
- **`direct`**: pn-external-channels attraverso un tunnel, per i test verso il consolidatore.

In entrambe c'è un journal durevole con ripresa, e l'output è 1:1 con l'input. Specifica: [`docs/evolutions/EVO-SENDNOTIF-OPUS-01.md`](../../../docs/evolutions/EVO-SENDNOTIF-OPUS-01.md).

## Prerequisiti

- Node.js e pnpm del monorepo; dalla root: `pnpm install` e `pnpm build`.
- **`e2e`**: un file di ambienti con URL, `groupId`, mittente e documento condiviso di ogni ente × ambiente. L'API key va in una variabile d'ambiente nella shell o nel `.env` di GOScript: nel file va solo il riferimento `${PN_API_KEY_…}`. Conviene tenere il `.env` fuori dalle cartelle sincronizzate (Dropbox, iCloud).
- **Fase `request-id`**: un profilo AWS SSO dello stesso account dell'ambiente, passato con `--aws-profiles`, con permesso `dynamodb:Query` su `pn-Timelines`.
- **`direct`**: il tunnel verso pn-external-channels aperto dall'utente (SSH o SSM port forwarding), più i riferimenti SafeStorage di `AAR` e `ATTO` già caricati.

## Utilizzo

```bash
# 1. ambienti: copia l'esempio fuori da git e compila i placeholder
cp scripts/send/send-dispatch-notifications/configs/environments.example.yaml \
   data/send-dispatch-notifications/configs/environments.yaml
pnpm send:dispatch:notifications:dev --list-envs

# 2. dry run (default): nessuna chiamata, piano di invio, output e report con stato DRY_RUN
pnpm send:dispatch:notifications:dev --env ente-test --input-file /percorso/qa.csv --mapping-profile qa-test

# 3. invio reale
pnpm send:dispatch:notifications:dev --env ente-test --input-file /percorso/qa.csv --mapping-profile qa-test --dry-run=false

# 4. invio + verifica + requestId (profilo AWS obbligatorio con --aws-profiles, validato da GOScript)
pnpm send:dispatch:notifications:dev --env ente-test --input-file /percorso/qa.csv --mapping-profile qa-test \
  --phases send,verify,request-id --aws-profiles sso_pn-core-test --dry-run=false

# 5. solo requestId per IUN già inviati (colonna iun dell'input, o output di un run precedente)
pnpm send:dispatch:notifications:dev --env ente-test --input-file /percorso/output.csv --mapping-profile qa-test \
  --phases request-id --aws-profiles sso_pn-core-test --dry-run=false

# 6. ripresa dopo un'interruzione (stesso file di input): il nome della directory lo stampa il riepilogo
pnpm send:dispatch:notifications:dev --resume send-dispatch-notifications_<timestamp> --dry-run=false
```

### Modalità `direct` (pn-external-channels)

Invio diretto al consolidatore, senza passare dal workflow di SEND. Prima di inviare, lo script controlla che il tunnel risponda.

```bash
pnpm send:dispatch:notifications:dev --mode direct --phases send \
  --input-file /percorso/consolidatore.csv --mapping-profile direct \
  --ec-base-url http://localhost:8888 \
  --defaults "sender.taxId=<codice-fiscale-PA>" "sender.denomination=<ente>" \
             "direct.aar.key=PN_AAR-<hash>.pdf" "direct.aar.sha256=<base64>" \
             "documents.reference.key=PN_NOTIFICATION_ATTACHMENTS-<hash>.pdf" "documents.reference.sha256=<base64>" \
  --dry-run=false
```

- **Profilo `direct`**:
  - colonne con i nomi dei campi di pn-ec: `receiverName`, `receiverFiscalCode`, `receiverAddress`, `receiverCap`, `receiverCity`, `receiverPr`, `receiverCountry`, `productType`, `printType`, `arName`…;
  - in più `aarKey`/`aarSha256` e `attoKey`/`attoSha256`;
  - chiave di riga `id`.
- **`requestId`**: generato dal template `--direct-request-id-template` e scritto nella colonna `requestId` dell'output.
- **Limiti**: rate di default 5/s; la verifica in `direct` non è ancora disponibile.

## Configurazione

Ogni parametro si passa da riga di comando (`--input-file`), dal file di config di GOScript (`input.file`) o da variabile d'ambiente (`INPUT_FILE`). Le durate accettano `ms`, `s`, `m`, `h`, `d`.

### Modalità e input

| Parametro           | Default       | Descrizione                                                                              |
| ------------------- | ------------- | ---------------------------------------------------------------------------------------- |
| `--mode`            | `e2e`         | `e2e` (API B2B di SEND) o `direct` (pn-external-channels)                                |
| `--input-file`      | —             | file di input (CSV, JSON, JSONL); obbligatorio, salvo con `--resume`                     |
| `--input-format`    | da estensione | `csv`, `json` o `jsonl`                                                                  |
| `--mapping-profile` | `standard`    | `standard`, `qa-test`, `direct` o path di un profilo JSON                                |
| `--row-key-column`  | dal profilo   | colonna con la chiave stabile della riga (altrimenti `r<indice>`)                        |
| `--defaults`        | —             | valori di default di campi canonici, `campo=valore` (es. `direct.aar.key=PN_AAR-…pdf`)   |
| `--phases`          | `send,verify` | sottoinsieme di `send`, `verify`, `request-id`; senza `send` gli IUN arrivano dall'input |

### Ambiente e mittente (`e2e`)

| Parametro               | Default                     | Descrizione                                               |
| ----------------------- | --------------------------- | --------------------------------------------------------- |
| `--env`                 | —                           | nome dell'ambiente nel file di ambienti                   |
| `--environments-file`   | `configs/environments.yaml` | file di ambienti YAML/JSON                                |
| `--list-envs`           | `false`                     | elenca gli ambienti (senza API key) ed esce               |
| `--base-path`           | dall'ambiente               | override dell'host dell'API B2B                           |
| `--pn-api-key`          | dall'ambiente               | override dell'API key (parametro sensibile, mai nei log)  |
| `--group-id`            | dall'ambiente               | override del `groupId` (ente a nome del quale si invia)   |
| `--sender-tax-id`       | dall'ambiente               | codice fiscale del mittente (run senza `--env`)           |
| `--sender-denomination` | dall'ambiente               | denominazione del mittente (run senza `--env`)            |
| `--api-version`         | `v2.6`                      | versione dell'endpoint `requests`: `v2.4`, `v2.5`, `v2.6` |

### Modalità `direct`

| Parametro                      | Default                               | Descrizione                                                                               |
| ------------------------------ | ------------------------------------- | ----------------------------------------------------------------------------------------- |
| `--ec-base-url`                | —                                     | base URL di pn-external-channels (tunnel); obbligatorio                                   |
| `--ec-client-id`               | `pn-cons-000`                         | header `x-pagopa-extch-cx-id`                                                             |
| `--direct-request-id-template` | `PNMAN.GO-{runId}.{rowKey}.PCRETRY_0` | template del `requestId`: `{runId}` `{rowKey}` `{rowIndex}` `{attempt}` `{col:<colonna>}` |

### Documenti

| Parametro                | Default             | Descrizione                                                         |
| ------------------------ | ------------------- | ------------------------------------------------------------------- |
| `--document-file`        | dall'ambiente       | documento/i condiviso/i, caricato/i una volta per run               |
| `--document-title`       | nome del file       | titolo del documento condiviso                                      |
| `--documents-dir`        | cartella dell'input | base dei path relativi dei documenti per riga                       |
| `--attachments-file`     | —                   | `files-results.json` di `send-upload-attachments` (colonna pratica) |
| `--upload-concurrency`   | `5`                 | PUT su SafeStorage in parallelo                                     |
| `--preload-batch-size`   | `15`                | file per chiamata di preload (1-15)                                 |
| `--upload-reuse-max-age` | `72h`               | al resume, età massima di un upload riusabile                       |

| Sorgente del documento | Come                                                                   |
| ---------------------- | ---------------------------------------------------------------------- |
| `pratica`              | colonna + `--attachments-file` (output di `send-upload-attachments`)   |
| file per riga          | colonna mappata su `documents.files` (più file separati da `\|`)       |
| riferimento            | colonne `documents.reference.key/versionToken/sha256`                  |
| documento condiviso    | `--document-file atto.pdf` o `defaults.documents.shared` dell'ambiente |

### Sicurezza, ripresa e retry

| Parametro                | Default | Descrizione                                                               |
| ------------------------ | ------- | ------------------------------------------------------------------------- |
| `--dry-run`              | `true`  | nessuna chiamata: piano, output e report con stato `DRY_RUN`              |
| `--yes`                  | `false` | salta la conferma interattiva (non in produzione)                         |
| `--confirm-production`   | —       | in produzione: numero di righe valide da confermare                       |
| `--fail-fast`            | `false` | si ferma alla prima riga non valida o fallita                             |
| `--verbose`              | `false` | una riga di log per ogni transizione di riga                              |
| `--resume`               | —       | directory di esecuzione (nome sotto `outputs/` o path) da riprendere      |
| `--retry-failed`         | `false` | con `--resume`, reinvia le righe `SEND_FAILED` ripetibili                 |
| `--retry-uncertain`      | `false` | con `--resume`, riconcilia le righe `SEND_UNCERTAIN`                      |
| `--send-retry-ambiguous` | `true`  | riconcilia gli esiti ambigui (timeout, 5xx) con la ricerca per protocollo |
| `--send-timeout`         | `10m`   | tempo massimo per riga in rischedulazione da 429                          |

### Throughput e HTTP

| Parametro         | Default                   | Descrizione                   |
| ----------------- | ------------------------- | ----------------------------- |
| `--rate`          | `20` (e2e) / `5` (direct) | chiamate al secondo           |
| `--burst`         | `1`                       | capienza del bucket           |
| `--rate-adaptive` | `true`                    | riduce il rate ai 429         |
| `--max-in-flight` | `40`                      | richieste HTTP contemporanee  |
| `--http-timeout`  | `60s`                     | timeout di una richiesta HTTP |
| `--proxy-url`     | —                         | proxy HTTP di debug           |

### Verifica e requestId

| Parametro                     | Default                                            | Descrizione                                                                     |
| ----------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------- |
| `--verify-initial-delay`      | `10s`                                              | primo controllo di stato dopo l'invio                                           |
| `--verify-timeout`            | `15m`                                              | timeout della verifica per riga                                                 |
| `--aws-profiles`              | —                                                  | profili AWS SSO (obbligatorio con `request-id`), validati da GOScript all'avvio |
| `--request-id-categories`     | `PREPARE_ANALOG_DOMICILE,PREPARE_DIGITAL_DOMICILE` | categorie cercate, in ordine di priorità                                        |
| `--request-id-select`         | `per-category`                                     | colonna `requestId`: `per-category` o `priority`                                |
| `--request-id-wait`           | `any`                                              | chiusura della riga: alla prima categoria (`any`) o a tutte (`all`)             |
| `--request-id-end-categories` | categorie di fine workflow                         | chiusura anticipata senza `requestId`                                           |
| `--request-id-initial-delay`  | `60s`                                              | primo controllo della timeline                                                  |
| `--request-id-timeout`        | `2h`                                               | timeout del `requestId` per riga                                                |
| `--dynamodb-concurrency`      | `10`                                               | query DynamoDB in parallelo                                                     |

### Output

| Parametro                 | Default                 | Descrizione                                           |
| ------------------------- | ----------------------- | ----------------------------------------------------- |
| `--output-format`         | come l'input            | `csv`, `json` o `jsonl`                               |
| `--output-file`           | directory di esecuzione | path esplicito del file principale                    |
| `--output-include-status` | `false`                 | colonne `_status`, `_notificationRequestId`, `_error` |
| `--output-only-success`   | `false`                 | solo le righe con IUN (`direct`: le righe inviate)    |

## Cosa fa

1. **Preflight:**
   - `e2e`: controlla API key e `groupId` con una chiamata a `groups`, e ferma un host di produzione senza `production: true`. Carica una sola volta l'eventuale documento condiviso;
   - `direct`: controlla il tunnel;
   - con `request-id`: legge `pn-Timelines` una volta.
2. **Validazione** di tutte le righe, senza chiamate: mapping dal profilo, campi obbligatori, formati, documenti locali (PDF, ≤ 200 MB, SHA-256) e chiavi di riga duplicate.
3. **Piano di invio** e conferma (in produzione serve anche `--confirm-production=<righe valide>`).
4. **Invio** a 20/s, con lo IUN ricavato subito dal `notificationRequestId`. Gli esiti ambigui (timeout, 5xx) si riconciliano con la ricerca per protocollo, senza mai creare due notifiche.
5. **Verifica** (`ACCEPTED`/`REFUSED`) a priorità bassa: non rallenta l'invio.
6. **requestId** (`--phases …,request-id`):
   - una query su `pn-Timelines` per IUN, ripetuta con backoff fino a 2 h;
   - stessa regola del `jq`: primo `PREPARE_ANALOG_DOMICILE`, poi `PREPARE_DIGITAL_DOMICILE`;
   - se le credenziali AWS scadono durante l'attesa: `aws sso login`, poi `--resume`.
7. **Output** nella directory di esecuzione `data/send-dispatch-notifications/outputs/send-dispatch-notifications_<timestamp>/`:
   - `output.<fmt>`: l'input più `iun` e `requestId`;
   - `report.<fmt>`: stato ed errori di ogni riga;
   - `journal.jsonl` e `run.json`.

   Una ripresa scrive in una directory nuova e rimanda al journal delle sessioni precedenti.

## Log

Gli errori di riga finiscono sempre nel log, sia in console sia in `execution.log` della directory di esecuzione, con codice e dettaglio di SEND. `--verbose` aggiunge una riga per ogni transizione. Il riepilogo finale raggruppa le righe con errori per codice.

## Profili di mapping

- `standard`: colonne con i nomi del vecchio formato SEND (`subject`, `recipientTaxId`, `physicalZip`…).
- `qa-test`: template CSV QA; `ID_Scenario` è la chiave di riga e lo IUN va nella colonna `iun`.
- `direct`: colonne con i nomi dei campi di pn-external-channels.
- Un file JSON con lo stesso schema (`--mapping-profile /percorso/profilo.json`).

## Codici di uscita

| Codice | Significato                                                                 |
| ------ | --------------------------------------------------------------------------- |
| `0`    | tutto ok                                                                    |
| `2`    | run concluso con righe non valide, fallite, incerte, rifiutate o in timeout |
| `1`    | errore globale (API key, gruppo, quota…)                                    |
| `130`  | interrotto con Ctrl-C; riprendibile con `--resume`                          |
