# Interop Analyze Alarms

> Versione: 1.0.0 | Autore: Team GO - Gestione Operativa

Esegue query CloudWatch per estrarre informazioni operative sugli allarmi k8s INTEROP.

## Funzionalità

- Recupera da CloudWatch le transizioni `OK → ALARM` nel range richiesto.
- Se `alarmName` è valorizzato, analizza solo quell’allarme.
- Se `alarmName` non è valorizzato, analizza le occorrenze k8s INTEROP supportate trovate nel range.
- Per ogni timestamp di allarme usa la finestra legacy: 300 secondi prima e 120 secondi dopo.
- Esegue la query `Application-Logs-Errors`.
- Estrae i CID dai log applicativi.
- Esegue la query CID tracker per ogni CID trovato.
- Scrive i log senza CID e i log CID correlati su file testuali.

## Prerequisiti

- Profilo AWS SSO configurato.
- Permessi CloudWatch per:
  - `DescribeAlarmHistory`;
  - query CloudWatch Logs sui log group `/aws/eks/interop-eks-cluster-<env>/application`.

```bash
aws sso login --profile <nome-profilo>
```

## Configurazione

### Parametri CLI

| Parametro     | Alias | Tipo   | Obbligatorio | Descrizione                                                                                            |
| ------------- | ----- | ------ | ------------ | ------------------------------------------------------------------------------------------------------ |
| `aws.profile` | `ap`  | string | sì           | Profilo AWS SSO da usare.                                                                              |
| `startDate`   | `sd`  | string | sì           | Inizio range CloudWatch alarm history, formato ISO 8601.                                               |
| `endDate`     | `ed`  | string | sì           | Fine range CloudWatch alarm history, formato ISO 8601.                                                 |
| `alarmName`   | `an`  | string | no           | Nome allarme CloudWatch. Se omesso, vengono analizzate le occorrenze k8s INTEROP supportate nel range. |

## Utilizzo

Analisi di un allarme specifico:

```bash
pnpm interop:analyze:alarms:dev -- \
  -ap pdnd-interop-prod \
  -an k8s-interop-be-backend-for-frontend-errors-prod \
  -sd 2026-05-09T16:00:00Z \
  -ed 2026-05-10T16:00:00Z
```

Analisi delle occorrenze k8s INTEROP supportate nel range:

```bash
pnpm interop:analyze:alarms:dev -- \
  -ap pdnd-interop-prod \
  -sd 2026-05-09T16:00:00Z \
  -ed 2026-05-10T16:00:00Z
```

Build:

```bash
pnpm --filter=interop-analyze-alarms build
```

## Regole sul nome allarme

Lo script supporta allarmi k8s INTEROP con pattern:

```text
k8s-<pod-app>-errors-<environment>[-...]
```

Esempi:

- `k8s-interop-be-backend-for-frontend-errors-prod`
- `k8s-interop-be-backend-for-frontend-errors-att`
- `k8s-interop-be-att-residence-verification-errors-att-eservices`

Il `pod_app` viene estratto dalla parte tra `k8s-` e `-errors-`.
L’ambiente viene letto dai token dopo `-errors-`.

Ambienti supportati:

- `prod`
- `att`
- `test`

## Output

I file vengono scritti nella execution output directory dello script:

- `<timestamp>_no_cid.txt`
- `<timestamp>_cid.txt`

---

**Ultima modifica**: 2026-07-13
