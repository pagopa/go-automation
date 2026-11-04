# send-dispatch-notifications

Invio di notifiche SEND da un file CSV, JSON o JSONL, con due modalità:

- **`e2e`**: API B2B di SEND, con throttling a 20 chiamate/s, verifica dell'accettazione e recupero del `requestId` da `pn-Timelines`;
- **`direct`**: pn-external-channels attraverso un tunnel, per i test verso il consolidatore.

In entrambe c'è un journal durevole con ripresa, e l'output è 1:1 con l'input. Specifica: [`docs/evolutions/EVO-SENDNOTIF-OPUS-01.md`](../../../docs/evolutions/EVO-SENDNOTIF-OPUS-01.md).

## Prerequisiti

- Node.js e pnpm del monorepo; dalla root: `pnpm install` e `pnpm build`.
- **`e2e`** con `send` o `verify`: un file di ambienti con URL, `groupId`, mittente e documento condiviso di ogni ente × ambiente. L'API key va in una variabile d'ambiente nella shell o nel `.env` di GOScript: nel file va solo il riferimento `${PN_API_KEY_…}`. Conviene tenere il `.env` fuori dalle cartelle sincronizzate (Dropbox, iCloud).
- **Fase `request-id`**: un profilo AWS SSO dello stesso account dell'ambiente, passato con `--aws-profiles`, con permesso `dynamodb:Query` su `pn-Timelines`. Con la sola fase `request-id` non servono API key né `--base-path`.
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

# 5. solo requestId per IUN già inviati (colonna iun dell'input, o output di un run precedente):
#    nessuna chiamata B2B, quindi né API key né --env sono obbligatori
pnpm send:dispatch:notifications:dev --env ente-test --input-file /percorso/output.csv --mapping-profile qa-test \
  --phases request-id --aws-profiles sso_pn-core-test --dry-run=false

# 6. ripresa dopo un'interruzione: gli STESSI parametri del run originale più --resume
#    (il nome della directory lo stampa il riepilogo; --input-file si può omettere)
pnpm send:dispatch:notifications:dev --env ente-test --mapping-profile qa-test \
  --phases send,verify,request-id --aws-profiles sso_pn-core-test --dry-run=false \
  --resume send-dispatch-notifications_<timestamp>

# 6b. anteprima della ripresa: stesso comando con --dry-run (il default), rilegge il journal e mostra cosa resta
pnpm send:dispatch:notifications:dev --env ente-test --mapping-profile qa-test \
  --phases send,verify,request-id --aws-profiles sso_pn-core-test \
  --resume send-dispatch-notifications_<timestamp>
```

### Ripresa (`--resume`)

- `--resume` accetta il nome della directory di esecuzione (sotto `data/send-dispatch-notifications/outputs/`) o un path assoluto. Solo un run con `--dry-run=false` scrive `run.json`: un dry run non si riprende.
- Le chiavi di idempotenza di una riga dipendono da `runId` e chiave di riga (in `direct` anche dal template del `requestId`); il contenuto della notifica da profilo, valori di default e documenti. Per non creare **notifiche o raccomandate duplicate**, la ripresa si rifiuta se queste impostazioni sono diverse da quelle del run originale (salvate in `run.json`, `parameters.identity`) ed elenca quelle cambiate:
  - sempre: `--mode`, formato dell'input, `--mapping-profile` (per un profilo JSON anche lo SHA-256 del contenuto), `--row-key-column`, `--direct-request-id-template`;
  - con `send` o `verify`: ambiente (`--env`, o `ad-hoc`/`direct`) e host (`--base-path`, `--ec-base-url`);
  - con `send`: `--defaults`, `--group-id`, `--sender-tax-id`, `--sender-denomination`, valori dell'ambiente (`sender`, `groupId`, `defaults`), documento condiviso (`--document-file`, `--document-title` o quello dell'ambiente), `--documents-dir`, `--attachments-file`.
- Possono cambiare: `--phases`, retry (`--retry-failed`, `--retry-uncertain`, `--send-retry-ambiguous`), throughput (`--rate`, `--burst`, `--max-in-flight`…), timeout, `--aws-profiles` e le opzioni di output.
- Un `run.json` scritto da una versione precedente dello script non contiene queste impostazioni: la ripresa viene rifiutata (avviare un nuovo run sulle righe rimaste).
- Il file di input deve essere identico (SHA-256), altrimenti la ripresa si ferma con `RESUME_INPUT_CHANGED`.
- Cosa riparte: le righe `SENDING` senza esito diventano `SEND_UNCERTAIN` e si riconciliano; `SENT`/`ACCEPTED` non concluse e `VERIFY_TIMEOUT`/`REQUEST_ID_NOT_FOUND` rientrano nella verifica / nel `requestId`; le `SEND_FAILED` ripetibili (compresa `THROTTLED`, vedi sotto) si reinviano solo con `--retry-failed`; una riga `INVALID` in una sessione precedente che ora risulta valida (input o documenti corretti) viene inviata.
- `--dry-run` con `--resume` rilegge il journal del run precedente (e controlla l'hash dell'input) senza scrivere nulla: il piano mostra le righe ancora da inviare e da elaborare.

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
- **`requestId`**: generato dal template `--direct-request-id-template`, che deve contenere `{rowKey}`, `{rowIndex}` o `{col:<colonna>}` (altrimenti tutte le righe avrebbero lo stesso `requestId`); scritto nella colonna `requestId` dell'output.
- **`--ec-base-url`**: con lo schema (`http://` o `https://`).
- **Produzione**: lo script non può riconoscere dall'host del tunnel (`localhost`) se dietro c'è la produzione. Se il tunnel punta a pn-external-channels di produzione, passare `--ec-production`: come per gli ambienti `production: true` servono `--confirm-production=<N>` e la conferma interattiva, e `--yes` non basta.
- **Limiti**: rate di default 5/s; la verifica in `direct` non è ancora disponibile.

## Configurazione

Ogni parametro si passa da riga di comando (`--input-file`), dal file di config di GOScript (`input.file`) o da variabile d'ambiente (`INPUT_FILE`). Le durate accettano `ms`, `s`, `m`, `h`, `d` (es. `500ms`, `1.5h`); i timeout e i ritardi vanno da `1ms` a circa 24,8 giorni (massimo di `setTimeout`), `--upload-reuse-max-age` è un'età e accetta anche `0`.

Per le liste (`--phases`, `--defaults`, `--document-file`…) i valori si separano con spazi o virgole. Usare la forma `--parametro valore` (con lo spazio) e non `--parametro=valore` quando il valore contiene `=`, come in `--defaults`.

### Modalità e input

| Parametro           | Default       | Descrizione                                                                              |
| ------------------- | ------------- | ---------------------------------------------------------------------------------------- |
| `--mode`            | `e2e`         | `e2e` (API B2B di SEND) o `direct` (pn-external-channels)                                |
| `--input-file`      | —             | file di input (CSV, JSON, JSONL); obbligatorio, salvo con `--resume`                     |
| `--input-format`    | da estensione | `csv`, `json` o `jsonl` (senza estensione nota: il formato del profilo)                  |
| `--mapping-profile` | `standard`    | `standard`, `qa-test`, `direct` o path di un profilo JSON                                |
| `--row-key-column`  | dal profilo   | colonna con la chiave stabile della riga (altrimenti `r<indice>`)                        |
| `--defaults`        | —             | valori di default di campi canonici, `campo=valore` (es. `direct.aar.key=PN_AAR-…pdf`)   |
| `--phases`          | `send,verify` | sottoinsieme di `send`, `verify`, `request-id`; senza `send` gli IUN arrivano dall'input |

**`--defaults` e le virgole**: il parser della riga di comando di GOScript divide ogni valore sulle virgole, quindi `--defaults "sender.denomination=Comune di X, Ufficio Y"` arriva in due pezzi. Lo script li ricompone: una voce che non inizia con `<campo>=` continua la voce precedente e viene riunita con `", "` (gli spazi attorno alla virgola si normalizzano a uno). Una voce che inizia con `<nome>=` è sempre una voce nuova, e un nome di campo sconosciuto è un errore.

**Precedenza dei valori** (dal più forte): valore della riga > parametro CLI (`--defaults`, `--group-id`, `--sender-*`) > ambiente (`sender`, `groupId`, `defaults`) > trasformazioni di riempimento del profilo (`default`, `constantIfPresent`) > default neutri del codice.

**Validazioni da ricordare**:

- il codice fiscale del destinatario viene portato in maiuscolo e deve essere un codice fiscale di persona fisica o una partita IVA di 11 cifre;
- `notificationOptions.taxonomyCode` deve rispettare `^\d{6}[AN]$` (es. `010202N`);
- con `notificationFeePolicy` `DELIVERY_MODE` sono obbligatori `paFee` e `vat` (percentuale 0–100);
- i file dei documenti per riga devono stare dentro `--documents-dir` (altrimenti la riga è `INVALID` con `DOCUMENT_OUTSIDE_DIR`).

### Ambiente e mittente (`e2e`)

| Parametro               | Default                                                                         | Descrizione                                               |
| ----------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `--env`                 | —                                                                               | nome dell'ambiente nel file di ambienti                   |
| `--environments-file`   | `environments.yaml` in `data/send-dispatch-notifications/configs/` o `configs/` | file di ambienti YAML/JSON                                |
| `--list-envs`           | `false`                                                                         | elenca gli ambienti (senza API key) ed esce               |
| `--base-path`           | dall'ambiente                                                                   | override dell'host dell'API B2B                           |
| `--pn-api-key`          | dall'ambiente                                                                   | override dell'API key (parametro sensibile, mai nei log)  |
| `--group-id`            | dall'ambiente                                                                   | override del `groupId` (ente a nome del quale si invia)   |
| `--sender-tax-id`       | dall'ambiente                                                                   | codice fiscale del mittente (run senza `--env`)           |
| `--sender-denomination` | dall'ambiente                                                                   | denominazione del mittente (run senza `--env`)            |
| `--api-version`         | `v2.6`                                                                          | versione dell'endpoint `requests`: `v2.4`, `v2.5`, `v2.6` |

Senza `--env` serve un run ad hoc con `--base-path` e `--pn-api-key`, salvo con la sola fase `request-id`.

### Modalità `direct`

| Parametro                      | Default                               | Descrizione                                                                               |
| ------------------------------ | ------------------------------------- | ----------------------------------------------------------------------------------------- |
| `--ec-base-url`                | —                                     | base URL di pn-external-channels (tunnel), con lo schema; obbligatorio                    |
| `--ec-client-id`               | `pn-cons-000`                         | header `x-pagopa-extch-cx-id`                                                             |
| `--ec-production`              | `false`                               | il tunnel punta alla produzione: servono `--confirm-production` e la conferma             |
| `--direct-request-id-template` | `PNMAN.GO-{runId}.{rowKey}.PCRETRY_0` | template del `requestId`: `{runId}` `{rowKey}` `{rowIndex}` `{attempt}` `{col:<colonna>}` |

### Documenti

| Parametro                | Default             | Descrizione                                                          |
| ------------------------ | ------------------- | -------------------------------------------------------------------- |
| `--document-file`        | dall'ambiente       | documento/i condiviso/i, caricato/i una volta per run                |
| `--document-title`       | nome del file       | titolo del documento condiviso                                       |
| `--documents-dir`        | cartella dell'input | base dei path relativi dei documenti per riga (non se ne può uscire) |
| `--attachments-file`     | —                   | `files-results.json` di `send-upload-attachments` (colonna pratica)  |
| `--upload-concurrency`   | `5`                 | PUT su SafeStorage in parallelo                                      |
| `--preload-batch-size`   | `15`                | file per chiamata di preload (1-15)                                  |
| `--upload-reuse-max-age` | `72h`               | al resume, età massima di un upload riusabile                        |

| Sorgente del documento | Come                                                                   |
| ---------------------- | ---------------------------------------------------------------------- |
| `pratica`              | colonna + `--attachments-file` (output di `send-upload-attachments`)   |
| file per riga          | colonna mappata su `documents.files` (più file separati da `\|`)       |
| riferimento            | colonne `documents.reference.key/versionToken/sha256`                  |
| documento condiviso    | `--document-file atto.pdf` o `defaults.documents.shared` dell'ambiente |

I documenti servono solo con la fase `send`: senza, il documento condiviso non viene né letto né caricato.

### Sicurezza, ripresa e retry

| Parametro                | Default | Descrizione                                                                                      |
| ------------------------ | ------- | ------------------------------------------------------------------------------------------------ |
| `--dry-run`              | `true`  | nessuna chiamata: piano, output e report con stato `DRY_RUN`                                     |
| `--yes`                  | `false` | salta la conferma interattiva (non in produzione)                                                |
| `--confirm-production`   | —       | in produzione: numero di righe **da inviare** mostrato dal piano (da elaborare, se non si invia) |
| `--fail-fast`            | `false` | si ferma alla prima riga non valida o fallita                                                    |
| `--verbose`              | `false` | una riga di log per ogni transizione di riga                                                     |
| `--resume`               | —       | directory di esecuzione (nome sotto `outputs/` o path) da riprendere, con gli stessi parametri   |
| `--retry-failed`         | `false` | con `--resume`, reinvia le righe `SEND_FAILED` ripetibili (compresa `THROTTLED`)                 |
| `--retry-uncertain`      | `false` | con `--resume`, riconcilia le righe `SEND_UNCERTAIN`                                             |
| `--send-retry-ambiguous` | `true`  | riconcilia gli esiti ambigui (timeout, 5xx) con la ricerca per protocollo                        |
| `--send-timeout`         | `10m`   | tempo massimo per riga in rischedulazione da 429                                                 |

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

| Parametro                 | Default                 | Descrizione                                                                                     |
| ------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------- |
| `--output-format`         | come l'input            | `csv`, `json` o `jsonl` (non il formato del profilo: un input JSON dà un output JSON)           |
| `--output-file`           | directory di esecuzione | path esplicito del file principale                                                              |
| `--output-include-status` | `false`                 | colonne `_status`, `_notificationRequestId`, `_error`                                           |
| `--output-only-success`   | `false`                 | solo le righe `SENT`, `ACCEPTED`, `REQUEST_ID_FOUND`, `REQUEST_ID_NOT_FOUND` (non le `REFUSED`) |

Le righe `REFUSED` restano solo nel report, e nel file principale hanno la colonna `iun` vuota: la notifica non esiste.

## Cosa fa

1. **Preflight:**
   - `e2e` con `send` o `verify`: controlla API key e `groupId` con una chiamata a `groups`, e ferma un host di produzione senza `production: true`. Carica una sola volta l'eventuale documento condiviso;
   - `direct`: controlla il tunnel;
   - con `request-id`: legge `pn-Timelines` una volta.
2. **Validazione** di tutte le righe, senza chiamate: mapping dal profilo, campi obbligatori, formati, documenti locali (PDF, ≤ 200 MB, SHA-256, dentro `--documents-dir`) e chiavi di riga duplicate.
3. **Piano di invio**: righe lette, valide, non valide, da inviare e da elaborare (in ripresa anche quelle già elaborate), stima della durata dell'invio. Chiavi di riga o `requestId` duplicati e, con `--fail-fast`, righe non valide bloccano il run: lo script scrive comunque report e output ed esce con `1`.
4. **Conferma**: `Inviare N notifiche?` (N = righe da inviare), oppure `Elaborare N righe (nessun invio)?` quando la sessione verifica o cerca solo i `requestId`. In produzione serve anche `--confirm-production=<N>`.
5. **Invio** a 20/s, con lo IUN ricavato subito dal `notificationRequestId`. Gli esiti ambigui (timeout, 5xx) si riconciliano con la ricerca per protocollo, senza mai creare due notifiche.
   - Una riga rischedulata dopo un `429` e fermata (interruzione, `--send-timeout`) diventa `SEND_FAILED` con codice `THROTTLED`, ripetibile: al resume si reinvia solo con `--retry-failed`.
   - Fermano l'intero run: gli errori di configurazione (`CONFIGURATION`), un `401`/`403` di SafeStorage e gli errori sui documenti diversi da quelli di upload o di configurazione (es. scrittura del journal fallita). Gli errori di upload di un file restano errori della riga.
6. **Verifica** (`ACCEPTED`/`REFUSED`) a priorità bassa: non rallenta l'invio.
7. **requestId** (`--phases …,request-id`):
   - una query su `pn-Timelines` per IUN, ripetuta con backoff fino a 2 h;
   - stessa regola del `jq`: primo `PREPARE_ANALOG_DOMICILE`, poi `PREPARE_DIGITAL_DOMICILE`;
   - se le credenziali AWS scadono durante l'attesa: `aws sso login`, poi `--resume` con gli stessi parametri.
8. **Output** nella directory di esecuzione `data/send-dispatch-notifications/outputs/send-dispatch-notifications_<timestamp>/`:
   - `output.<fmt>`: l'input più `iun` e `requestId`;
   - `report.<fmt>`: stato ed errori di ogni riga;
   - `journal.jsonl` e `run.json`.

   Una ripresa scrive in una directory nuova e rimanda al journal delle sessioni precedenti.

## Interruzione (Ctrl-C)

Al primo segnale lo script smette di avviare chiamate, completa quelle in volo, scrive output e report, chiude il journal ed esce. Il riepilogo distingue le righe **in corso all'interruzione** (`SENDING`/`RECONCILING`: la notifica potrebbe esistere, il `--resume` le riconcilia) da quelle **non inviate** (`PENDING`). Un segnale durante preflight o validazione chiude comunque il journal e non invia nulla; la validazione si ferma alla riga successiva. Ctrl-C mentre è aperta la domanda di conferma (o un'altra domanda interattiva) chiude il journal ed esce con `130`, senza inviare nulla. Un secondo Ctrl-C esce subito (il journal resta coerente perché è append-only).

## Log

Gli errori di riga finiscono sempre nel log, sia in console sia in `execution.log` della directory di esecuzione, con codice e dettaglio di SEND. Le righe non valide (`ROW_INVALID`) vi compaiono con codice e campo di ogni problema (es. `INVALID_FORMAT(recipient.taxId)`): il messaggio completo, che può citare i dati della riga, sta solo nel report. `--verbose` aggiunge una riga per ogni transizione. Il riepilogo finale raggruppa le righe con errori per codice.

## Profili di mapping

- `standard`: colonne con i nomi del vecchio formato SEND (`subject`, `recipientTaxId`, `physicalZip`…).
- `qa-test`: template CSV QA; `ID_Scenario` è la chiave di riga e lo IUN va nella colonna `iun`.
- `direct`: colonne con i nomi dei campi di pn-external-channels.
- Un file JSON con lo stesso schema (`--mapping-profile /percorso/profilo.json`).

## Codici di uscita

| Codice | Significato                                                                                                                                                                                                                             |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`    | tutto ok (anche: dry run senza righe non valide, nessuna riga da elaborare)                                                                                                                                                             |
| `2`    | run concluso con righe non valide, fallite, incerte, rifiutate, in timeout o non inviate; credenziali AWS scadute durante l'attesa del `requestId`                                                                                      |
| `1`    | errore globale (API key, gruppo, quota, SafeStorage…), parametri non validi, ripresa con parametri diversi, chiavi o `requestId` duplicati, `--fail-fast` con righe non valide, `--confirm-production` mancante o diverso in produzione |
| `3`    | conferma interattiva negata (o abbandonata con Esc): nessun invio                                                                                                                                                                       |
| `130`  | interrotto con Ctrl-C (SIGINT) dopo la chiusura ordinata; riprendibile con `--resume`                                                                                                                                                   |
| `143`  | interrotto con SIGTERM (es. `kill`, stop del container), come sopra                                                                                                                                                                     |
| `131`  | interrotto con SIGQUIT (Ctrl-\\), come sopra                                                                                                                                                                                            |
| `1`    | anche: secondo Ctrl-C durante la chiusura, o chiusura ordinata fallita                                                                                                                                                                  |

Con un segnale il codice è quello di GOScript (`128 + numero del segnale`), indipendentemente dall'esito delle righe.
