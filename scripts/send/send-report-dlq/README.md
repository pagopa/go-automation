# send-report-dlq

> Versione: 1.0.0 | Autore: Team GO - Gestione Operativa

Script che interroga le **Dead Letter Queue (DLQ)** di uno o più account AWS SEND e genera un report con il numero di messaggi presenti e l'età del messaggio più vecchio per ciascuna coda. I risultati vengono visualizzati a console e possono essere esportati in formato JSON, CSV o HTML.

## Indice

- [Come funziona](#come-funziona)
- [Prerequisiti](#prerequisiti)
- [Configurazione](#configurazione)
- [Utilizzo](#utilizzo)
- [Output](#output)
- [Troubleshooting](#troubleshooting)

---

## Come funziona

1. **Raccolta dati** — Per ogni profilo AWS configurato, lo script:
   - Elenca tutte le code SQS il cui nome termina con `-DLQ` (usando `ListQueuesCommand` con paginazione)
   - Filtra quelle con `ApproximateNumberOfMessages > 0` (via `GetQueueAttributesCommand`)
   - Recupera da **CloudWatch** l'età del messaggio più vecchio in coda (metrica `ApproximateAgeOfOldestMessage`, finestra degli ultimi 5 minuti)

2. **Esecuzione parallela** — I profili vengono interrogati in parallelo tramite `AWSMultiClientProvider.mapParallelSettled`, che garantisce che un errore su un profilo non blocchi gli altri.

3. **Visualizzazione** — Per ogni profilo viene mostrata una tabella con le DLQ che contengono messaggi. Se i profili sono più di uno, viene aggiunta una tabella di riepilogo finale con i totali.

4. **Export** — Al termine, i dati vengono sempre salvati su file. Il percorso di default è `send-report-dlq_YYYY-MM-DD.<formato>` nella directory `output/` dello script. Può essere sovrascritto con `--output-file`:
   - **JSON** (default): struttura raggruppata per profilo (con `generatedAt`)
   - **CSV / HTML**: righe piatte con le colonne Profile, Queue Name, Messages, Age (days)

---

## Prerequisiti

### Software

| Software | Versione minima | Note            |
| -------- | --------------- | --------------- |
| Node.js  | >= 24.0.0       | LTS consigliata |
| pnpm     | >= 10.0.0       | Package manager |

### Credenziali AWS

La sessione SSO deve essere attiva per ogni profilo che si intende interrogare:

```bash
aws sso login --profile sso_pn-core-dev
aws sso login --profile sso_pn-confinfo-dev
```

---

## Configurazione

La configurazione operativa avviene principalmente via CLI. I percorsi relativi vengono risolti nella directory di output dell'esecuzione corrente.

### Parametri CLI

| Parametro         | Alias   | Tipo                          | Obbligatorio | Default                                | Descrizione                                                                |
| ----------------- | ------- | ----------------------------- | ------------ | -------------------------------------- | -------------------------------------------------------------------------- |
| `--aws-profiles`  | `--aps` | `string[]`                    | Sì           | —                                      | Uno o più profili AWS SSO, separati da virgola                             |
| `--output-file`   | `-of`   | `string`                      | No           | `send-report-dlq_YYYY-MM-DD.<formato>` | Percorso del file di output (assoluto, o nome relativo alla dir `output/`) |
| `--output-format` | `-ff`   | `json\|jsonl\|csv\|html\|txt` | No           | `json`                                 | Formato del file di output                                                 |

### Note sui parametri

**`--aws-profiles`**: accetta uno o più profili. Con un singolo profilo non viene mostrata la tabella di riepilogo; con più profili la tabella di summary è inclusa.

```bash
# Profilo singolo
--aws-profiles sso_pn-core-dev

# Profili multipli (virgola, senza spazi)
--aws-profiles sso_pn-core-dev,sso_pn-confinfo-dev,sso_pn-core-uat
```

**`--output-file`**: se omesso, il file viene creato automaticamente con nome `send-report-dlq_<data-odierna>.<formato>`. Se il percorso e relativo viene risolto nella directory `data/send-report-dlq/outputs/send-report-dlq_<timestamp>/`; se e assoluto viene usato cosi com'e. La directory padre viene creata automaticamente se non esiste.

```bash
# Default → data/send-report-dlq/outputs/send-report-dlq_<timestamp>/send-report-dlq_2026-02-27.json
(nessun parametro)

# Relativo → data/send-report-dlq/outputs/send-report-dlq_<timestamp>/report.json
--output-file report.json

# Assoluto
--output-file /tmp/dlq-report.json
```

**`--output-format`**: determina sia la struttura del file sia l'estensione del nome di default. Valori accettati: `json`, `jsonl`, `csv`, `html`, `txt`. Se si specifica `--output-format csv` senza `--output-file`, il file di default sara `send-report-dlq_2026-02-27.csv`.

---

## Utilizzo

### Development (tsx, senza build)

```bash
# Dalla root del monorepo
pnpm send:report:dlq:dev --aws-profiles sso_pn-core-dev
```

### Production (build + node)

```bash
# Build
pnpm send:report:dlq:build

# Esecuzione
pnpm send:report:dlq:prod --aws-profiles sso_pn-core-dev
```

### Direttamente nel package

```bash
cd scripts/send/send-report-dlq

# Dev
pnpm dev --aws-profiles sso_pn-core-dev

# Production
pnpm start --aws-profiles sso_pn-core-dev
```

### Esempi pratici

```bash
# 1. Report singolo ambiente — esporta automaticamente output/send-report-dlq_2026-02-27.json
pnpm send:report:dlq:dev --aws-profiles sso_pn-core-dev

# 2. Report multi-ambiente — esporta automaticamente output/send-report-dlq_2026-02-27.json
pnpm send:report:dlq:dev --aws-profiles sso_pn-core-dev,sso_pn-confinfo-dev,sso_pn-core-uat,sso_pn-confinfo-uat

# 3. Nome file personalizzato nella directory output/
pnpm send:report:dlq:dev --aws-profiles sso_pn-core-dev,sso_pn-confinfo-dev --output-file report-dev.json

# 4. Export in CSV — default: output/send-report-dlq_2026-02-27.csv
pnpm send:report:dlq:dev --aws-profiles sso_pn-core-dev,sso_pn-confinfo-dev --output-format csv

# 5. Export in CSV con percorso assoluto
pnpm send:report:dlq:dev \
  --aws-profiles sso_pn-core-dev,sso_pn-confinfo-dev \
  --output-file /tmp/dlq-report.csv \
  --output-format csv

# 6. Export in HTML
pnpm send:report:dlq:dev \
  --aws-profiles sso_pn-core-dev,sso_pn-confinfo-dev \
  --output-format html

# 7. Tutti gli ambienti prod (export automatico in JSON)
pnpm send:report:dlq:prod \
  --aws-profiles sso_pn-core-prod,sso_pn-confinfo-prod

# 8. Usando gli alias brevi
pnpm send:report:dlq:dev \
  --aps sso_pn-core-dev,sso_pn-confinfo-dev \
  -ff csv
```

---

## Output

### Console

Per ogni profilo viene stampata una tabella delle DLQ con messaggi in coda:

```
> Profile: sso_pn-core-dev
  ⚠ 2 DLQs with messages

  ┌─────────────────────────────────────────┬──────────┬────────────┐
  │ Queue Name                              │ Messages │ Age (days) │
  ├─────────────────────────────────────────┼──────────┼────────────┤
  │ pn-delivery-push-actions-DLQ            │       14 │          3 │
  │ pn-mandate-DLQ                          │        2 │        N/A │
  └─────────────────────────────────────────┴──────────┴────────────┘

> Profile: sso_pn-confinfo-dev
  ✔ No DLQs with messages

> Summary
  ┌──────────────────────┬────────────────────┬────────────────┐
  │ Profile              │ DLQs with messages │ Total messages │
  ├──────────────────────┼────────────────────┼────────────────┤
  │ sso_pn-core-dev      │                  2 │             16 │
  │ sso_pn-confinfo-dev  │                  0 │              0 │
  └──────────────────────┴────────────────────┴────────────────┘

  Total DLQs with messages: 2
  Total messages across all DLQs: 16
```

La tabella di **Summary** appare solo quando si interrogano più di un profilo.

Il campo **Age (days)** mostra `N/A` quando CloudWatch non ha dati per quella coda (es. metrica non pubblicata nell'ultimo periodo di campionamento).

### File JSON (formato raggruppato per profilo)

```json
{
  "generatedAt": "2026-02-27T10:30:00.000Z",
  "profiles": {
    "sso_pn-core-dev": [
      {
        "queueName": "pn-delivery-push-actions-DLQ",
        "messageCount": 14,
        "ageOfOldestMessageDays": 3
      },
      {
        "queueName": "pn-mandate-DLQ",
        "messageCount": 2,
        "ageOfOldestMessageDays": null
      }
    ],
    "sso_pn-confinfo-dev": []
  }
}
```

> `ageOfOldestMessageDays` è `null` nel JSON (e `N/A` in CSV/HTML) quando CloudWatch non ha dati disponibili.

### File CSV (righe piatte)

```csv
Profile,Queue Name,Messages,Age (days)
sso_pn-core-dev,pn-delivery-push-actions-DLQ,14,3
sso_pn-core-dev,pn-mandate-DLQ,2,N/A
```

### File HTML

Tabella HTML con le stesse colonne del CSV, stilizzata e pronta per essere aperta nel browser.

---

## Troubleshooting

### "The security token included in the request is expired"

**Causa**: La sessione SSO è scaduta.

**Soluzione**:

```bash
aws sso login --profile <nome-profilo>
```

### "Profile X failed: fetch failed" / "ECONNREFUSED" / "ETIMEDOUT"

**Causa**: Problema di rete o endpoint AWS non raggiungibile (es. VPN non attiva, proxy aziendale).

**Soluzione**: Verificare la connettività di rete e, se necessario, connettersi alla VPN.

### "Invalid output format"

**Causa**: Il valore di `--output-format` non è tra quelli accettati.

**Soluzione**: Usare uno dei valori validi: `json`, `csv`, `html`.

```bash
# Sbagliato
--output-format xlsx

# Corretto
--output-format csv
```

### "All profiles failed. Check AWS credentials and profile names."

**Causa**: Tutti i profili specificati hanno restituito un errore (credenziali scadute, nome profilo errato, permessi mancanti).

**Soluzione**:

1. Verificare che i nomi dei profili siano corretti: `aws configure list-profiles`
2. Rinnovare le sessioni SSO per tutti i profili
3. Verificare i permessi IAM (`sqs:ListQueues`, `sqs:GetQueueAttributes`, `cloudwatch:GetMetricStatistics`)

### "Module not found" / errori di import

**Causa**: La libreria `go-common` non è stata compilata, oppure le dipendenze non sono installate.

**Soluzione**:

```bash
# Dalla root del monorepo
pnpm install
pnpm build:common
pnpm send:report:dlq:build
```

### L'età del messaggio appare sempre "N/A"

**Causa**: CloudWatch non ha dati recenti per la metrica `ApproximateAgeOfOldestMessage`. Questo può accadere se:

- La coda ha messaggi ma la metrica non è ancora stata pubblicata (ritardo CloudWatch fino a 5 minuti)
- Il periodo di campionamento è troppo breve (lo script usa una finestra di 5 minuti)

**Soluzione**: Attendere qualche minuto e rieseguire lo script. Se il problema persiste, verificare che la coda abbia effettivamente messaggi e che i permessi CloudWatch siano corretti.

### Verifica type safety (senza eseguire lo script)

```bash
pnpm --filter=send-report-dlq exec tsc --noEmit
```

---

**Ultima modifica**: 2026-04-10
**Maintainer**: Team GO - Gestione Operativa
