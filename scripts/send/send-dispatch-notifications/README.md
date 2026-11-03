# send-dispatch-notifications

Invio di notifiche SEND tramite API B2B (`e2e`), con throttling a 20 chiamate/s, verifica dell'accettazione, journal durevole con ripresa e output 1:1 con l'input. Specifica: [`docs/evolutions/EVO-SENDNOTIF-OPUS-01.md`](../../../docs/evolutions/EVO-SENDNOTIF-OPUS-01.md).

Stato: **Fasi 1 e 2** (invio, verifica, `requestId` da `pn-Timelines`). La modalità `direct` arriva con la Fase 3.

## Uso rapido

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
pnpm send:dispatch:notifications:dev --env ente-test --input-file /percorso/qa.csv --mapping-profile qa-test --phases send,verify,request-id --aws-profiles sso_pn-core-test --dry-run=false

# 5. solo requestId per IUN già inviati (colonna iun dell'input, o output di un run precedente)
pnpm send:dispatch:notifications:dev --env ente-test --input-file /percorso/output.csv --mapping-profile qa-test --phases request-id --aws-profiles sso_pn-core-test --dry-run=false

# 6. ripresa dopo un'interruzione (stesso file di input): il nome della directory lo stampa il riepilogo
pnpm send:dispatch:notifications:dev --resume send-dispatch-notifications_<timestamp> --dry-run=false
```

L'API key non va mai nel file di ambienti: `apiKey: ${PN_API_KEY_ENTE_TEST}` e la variabile nella shell o nel `.env` di GOScript. Conviene tenere il `.env` fuori dalle cartelle sincronizzate (Dropbox, iCloud).

## Cosa fa

1. **Preflight:** controlla API key e `groupId` con una chiamata a `groups`, e ferma un host di produzione senza `production: true`. Carica una sola volta l'eventuale documento condiviso.
2. **Validazione** di tutte le righe, senza chiamate: mapping dal profilo, campi obbligatori, formati, documenti locali (PDF, ≤ 200 MB, SHA-256) e chiavi di riga duplicate.
3. **Piano di invio** e conferma (in produzione serve anche `--confirm-production=<righe valide>`).
4. **Invio** a 20/s, con IUN ricavato subito dal `notificationRequestId`. Gli esiti ambigui (timeout, 5xx) si riconciliano con la ricerca per protocollo, senza mai creare due notifiche.
5. **Verifica** (`ACCEPTED`/`REFUSED`) a priorità bassa: non rallenta l'invio.
6. **requestId** (`--phases …,request-id`): una query su `pn-Timelines` per IUN, ripetuta con backoff fino a 2 h; stessa regola del `jq` (primo `PREPARE_ANALOG_DOMICILE`, poi `PREPARE_DIGITAL_DOMICILE`). Se le credenziali AWS scadono durante l'attesa: `aws sso login`, poi `--resume`.
7. **Output** nella directory di esecuzione `data/send-dispatch-notifications/outputs/send-dispatch-notifications_<timestamp>/`: `output.<fmt>` (input + `iun`), `report.<fmt>` (stato ed errori per riga), `journal.jsonl`, `run.json`. Una ripresa scrive in una directory nuova e rimanda al journal delle sessioni precedenti.

## Log

Gli errori di riga finiscono sempre nel log (console ed `execution.log` della directory di esecuzione) con codice e dettaglio di SEND; `--verbose` aggiunge una riga per ogni transizione. Il riepilogo finale raggruppa le righe con errori per codice.

## Documenti

| Sorgente            | Come                                                                   |
| ------------------- | ---------------------------------------------------------------------- |
| `pratica`           | colonna + `--attachments-file` (output di `send-upload-attachments`)   |
| file per riga       | colonna mappata su `documents.files` (più file separati da `\|`)       |
| riferimento         | colonne `documents.reference.key/versionToken/sha256`                  |
| documento condiviso | `--document-file atto.pdf` o `defaults.documents.shared` dell'ambiente |

## Profili di mapping

- `standard`: colonne con i nomi del vecchio formato SEND (`subject`, `recipientTaxId`, `physicalZip`…).
- `qa-test`: template CSV QA (`ID_Scenario` come chiave di riga, IUN in `iun`).
- un file JSON con lo stesso schema (`--mapping-profile /percorso/profilo.json`).

## Codici di uscita

`0` tutto ok · `2` run concluso con righe non valide, fallite, incerte, rifiutate o in timeout · `1` errore globale (API key, gruppo, quota…) · `130` interrotto con Ctrl-C (riprendibile con `--resume`).
