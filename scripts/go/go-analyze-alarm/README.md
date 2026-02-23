# Go Analyze Alarm

> Versione: 1.0.0 | Autore: Team GO - Gestione Operativa

Dato un allarme CloudWatch e il momento in cui e scattato, esegue automaticamente il runbook associato: interroga i log dei microservizi coinvolti, identifica la causa tramite pattern noti e determina la risoluzione operativa corretta. Salva la traccia di esecuzione in `data/` per revisione successiva.

## Indice

- [Come funziona](#come-funziona)
- [Runbook disponibili](#runbook-disponibili)
- [Prerequisiti](#prerequisiti)
- [Parametri CLI](#parametri-cli)
- [Utilizzo](#utilizzo)
- [Output](#output)
- [Troubleshooting](#troubleshooting)

## Come funziona

1. **Lookup runbook**: lo script cerca il runbook registrato per il nome dell'allarme fornito
2. **Calcolo time window**: costruisce un intervallo `[alarmDatetime - 5min, alarmDatetime + 5min]`
3. **Esecuzione step-by-step**: ogni step del runbook interroga CloudWatch Logs (o altri servizi) con query Insights; le variabili estratte passano agli step successivi
4. **Match casi noti**: al termine degli step, il RunbookEngine confronta i dati raccolti con i pattern dei casi noti e restituisce il primo match (o un fallback)
5. **Salvataggio trace**: l'intera traccia di esecuzione (step, variabili, risultato) viene salvata in `data/trace-{alarmName}.json`

## Runbook disponibili

| Allarme                            | Microservizi analizzati                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| `pn-address-book-io-IO-ApiGwAlarm` | pn-user-attributes, pn-data-vault, pn-external-registries, pn-ioAuthorizerLambda |

### pn-address-book-io-IO-ApiGwAlarm

Analizza gli errori HTTP sull'API Gateway del microservizio `pn-user-attributes` (rubrica AppIO).

**Catena di analisi** (10 step):

1. Query API GW AccessLog — filtra `status >= 400` nella time window
2. Parse errori API GW — estrae `errorCount`, `xRayTraceId`, `statusCode`; si ferma se non ci sono errori
3. Query + analisi `pn-ioAuthorizerLambda` — cerca timeout lambda (`duration >= 5000ms`)
4. Query + analisi `pn-user-attributes` — segue il trace ID estratto dall'API GW
5. Query + analisi `pn-data-vault` — cerca lo stesso trace ID (continueOnFailure)
6. Query + analisi `pn-external-registries` — cerca lo stesso trace ID (continueOnFailure)

**Casi noti riconosciuti** (in ordine di priorita):

| ID                              | Descrizione                                       | Risoluzione                         |
| ------------------------------- | ------------------------------------------------- | ----------------------------------- |
| `io-authorizer-lambda-timeout`  | Lambda timeout > 5000ms                           | Nessuna azione se saltuario         |
| `gateway-timeout-504`           | Gateway Timeout 504                               | Transitorio, nessuna azione         |
| `pdv-404`                       | Record mancante su Personal Data Vault            | Caso noto, vedi PN-15981            |
| `appio-activation-not-found`    | AppIO 404 - Activation not found                  | Chiusura, caso noto                 |
| `appio-cosmos-429`              | AppIO Cosmos DB rate limit (429)                  | Transitorio lato AppIO              |
| `io-activation-save-failed-pdv` | Salvataggio io-activation-service fallito         | Vedi caso PDV 404, PN-16877         |
| `io-status-activated-readding`  | Re-inserimento in addressbook dopo attivazione IO | Nessuna azione                      |
| `dynamodb-transaction-conflict` | TransactionConflict su DynamoDB                   | Caso noto, vedi PN-17228            |
| `internal-error-sqs`            | InternalError / SQS sendMessageBatch              | Caso noto al gruppo Infra, PN-16131 |

## Prerequisiti

| Software | Versione Minima | Note            |
| -------- | --------------- | --------------- |
| Node.js  | >= 24.0.0       | LTS consigliata |
| pnpm     | >= 10.0.0       | Package manager |
| AWS CLI  | >= 2.0          | Per SSO         |

**Permessi AWS richiesti**: `logs:StartQuery`, `logs:GetQueryResults`, `cloudwatch:DescribeAlarms`

```bash
# Login SSO prima dell'esecuzione
aws sso login --profile sso_pn-core-prod
```

## Parametri CLI

| Parametro          | Alias  | Tipo     | Obbligatorio | Descrizione                         |
| ------------------ | ------ | -------- | ------------ | ----------------------------------- |
| `--alarm-name`     | `-an`  | string   | Si           | Nome esatto dell'allarme CloudWatch |
| `--alarm-datetime` | `-ad`  | string   | Si           | Timestamp allarme (ISO 8601)        |
| `--aws-profiles`   | `-aps` | string[] | Si           | Profili AWS SSO (virgola-separati)  |

Il timestamp deve essere in formato **ISO 8601**: `YYYY-MM-DDTHH:MM:SSZ`

## Utilizzo

### Analisi di un allarme (caso tipico)

```bash
pnpm go:analyze:alarm:dev -- \
  --alarm-name "pn-address-book-io-IO-ApiGwAlarm" \
  --alarm-datetime "2025-02-20T14:30:00Z" \
  --aws-profiles "sso_pn-core-prod"
```

### Con alias corti

```bash
pnpm go:analyze:alarm:dev -- \
  -an "pn-address-book-io-IO-ApiGwAlarm" \
  -ad "2025-02-20T14:30:00Z" \
  -aps "sso_pn-core-prod"
```

### Analisi su piu profili AWS

Utile se i microservizi della catena appartengono ad account diversi:

```bash
pnpm go:analyze:alarm:dev -- \
  -an "pn-address-book-io-IO-ApiGwAlarm" \
  -ad "2025-02-20T14:30:00Z" \
  -aps "sso_pn-core-prod,sso_pn-confinfo-prod"
```

> Lo script usa il **primo profilo** della lista per costruire il `ServiceRegistry`. I profili aggiuntivi sono disponibili per estensioni future del runbook.

### Modalita production (build + node)

```bash
pnpm go:analyze:alarm:build
pnpm go:analyze:alarm:prod -- \
  -an "pn-address-book-io-IO-ApiGwAlarm" \
  -ad "2025-02-20T14:30:00Z" \
  -aps "sso_pn-core-prod"
```

## Output

### Console

Lo script stampa il risultato dell'analisi in tre sezioni:

```
=== Go Analyze Alarm ===
Alarm:    pn-address-book-io-IO-ApiGwAlarm
Datetime: 2025-02-20T14:30:00Z
AWS Profiles: sso_pn-core-prod
Time range: 2025-02-20T14:25:00.000Z → 2025-02-20T14:35:00.000Z

=== Executing Runbook ===
[OK] query-api-gw-logs         — 3 results
[OK] parse-api-gw-errors       — errors: 3, statusCode: 500, traceId: 1-abc123
[OK] query-io-authorizer-lambda — 0 results
...

=== Runbook Result ===
Status:         completed
Steps executed: 10
Duration:       4823ms
Matched case:   PDV 404 - Record mancante su Personal Data Vault

[CASO NOTO] Record mancante su PDV (Personal Data Vault)
Risoluzione: Scenario di errore già noto ed in via di risoluzione sul codice applicativo
Task JIRA: PN-15981
```

Se nessun caso noto e riconosciuto, lo script stampa un **fallback** con tutti i valori raccolti:

```
[CASO NON RICONOSCIUTO] Impossibile identificare univocamente la causa dell'errore.
Errori API GW: 2
Status Code: 429
User Attributes: <messaggio di errore grezzo>
...
```

### File trace

Ogni esecuzione produce un file JSON in `data/`:

```
data/trace-pn-address-book-io-IO-ApiGwAlarm.json
```

Il file contiene la traccia completa: step eseguiti, variabili estratte, caso matched, durata. Utile per post-mortem o debugging del runbook.

## Troubleshooting

### "No runbook found for alarm: ..."

L'allarme fornito non ha un runbook registrato in `RUNBOOK_REGISTRY`.

```bash
# Verificare il nome esatto dell'allarme (case-sensitive)
# Runbook disponibili: pn-address-book-io-IO-ApiGwAlarm
```

### "Invalid alarm datetime"

Il formato del timestamp non e ISO 8601 valido.

```bash
# Corretto
-ad "2025-02-20T14:30:00Z"

# Errato
-ad "20/02/2025 14:30"
-ad "2025-02-20"
```

### "ExpiredToken" / credenziali scadute

```bash
aws sso login --profile sso_pn-core-prod
aws sts get-caller-identity --profile sso_pn-core-prod  # verifica
```

### Nessun risultato dai log CloudWatch

- La time window e ±5 minuti dall'`alarm.datetime`: assicurarsi che il timestamp sia preciso
- I log potrebbero non essere ancora disponibili (latenza di ingestione CloudWatch ~1-2 min)
- Verificare che il profilo SSO abbia i permessi `logs:StartQuery` / `logs:GetQueryResults`

### "Cannot find module '@go-automation/go-common'"

```bash
# Dalla root del monorepo
pnpm build:common
pnpm go:analyze:alarm:build
```

### Verifica type errors

```bash
pnpm --filter=go-analyze-alarm exec tsc --noEmit
```

---

**Ultima modifica**: 2026-02-23
**Maintainer**: Team GO - Gestione Operativa
