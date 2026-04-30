# AWS Delete SQS

> Versione: 1.0.0 | Maintainer: Team GO - Gestione Operativa | Ultima modifica: 2025-05-22

Script progettato per l'eliminazione sicura e resiliente di messaggi da una coda **Amazon SQS**. Supporta sia l'eliminazione mirata tramite un file di input (prodotto da `aws-dump-sqs`) sia il purge completo della coda.

## Indice

- [Obiettivo](#obiettivo)
- [Prerequisiti](#prerequisiti)
- [Configurazione](#configurazione)
- [Utilizzo](#utilizzo)
- [Output](#output)
- [Funzionamento e Sicurezza](#funzionamento-e-sicurezza)
- [Troubleshooting](#troubleshooting)

---

## Obiettivo

Eliminazione sicura e resiliente di messaggi da una coda Amazon SQS, supportando sia l'eliminazione mirata (file NDJSON) che il purge totale, seguendo le best practice AWS.

## Prerequisiti

- **Software**: Node.js (>= 22.14.0), pnpm (>= 10.0.0).
- **Accesso**: Profilo AWS SSO attivo (`aws sso login --profile <nome>`).
- **Permessi**: `sqs:ReceiveMessage`, `sqs:DeleteMessage`, `sqs:GetQueueAttributes`, `sqs:ChangeMessageVisibility`.

## Configurazione

### Parametri CLI

| Parametro       | Alias     | Obbligatorio | Default | Descrizione                                             |
| --------------- | --------- | ------------ | ------- | ------------------------------------------------------- |
| `--aws-profile` | `-ap`     | Sì           | -       | Nome del profilo AWS SSO.                               |
| `--queue-name`  | `-qn`     | No           | -       | Nome della coda SQS (se non si fornisce `--queue-url`). |
| `--input-file`  | `-f`      | No           | -       | Percorso file NDJSON con messaggi da eliminare.         |
| `--purge-all`   | `--purge` | No           | `false` | Se `true`, elimina TUTTI i messaggi.                    |

## Utilizzo

_Esempi di comandi standardizzati per scenari comuni._

- **Scenario A: Eliminazione mirata basata su dump**

```bash
pnpm --filter=aws-delete-sqs start --qn <coda> -f dump.ndjson --ap <profilo>
```

- **Scenario B: Purge completo della coda (richiede conferma)**

```bash
pnpm --filter=aws-delete-sqs start --qn <coda> --purge-all --ap <profilo>
```

## Output

- **Artifacts**: Nessun file di output generato.
- **Console output**: Report in tempo reale dei messaggi eliminati, rilasciati o in elaborazione.

## Funzionamento e Sicurezza

_Informazioni dettagliate sul comportamento dello script e le misure di sicurezza adottate._

- **Logica Operativa**:
  1. Risolve l'URL della coda e valida i parametri. Richiede conferma interattiva per ogni operazione di eliminazione.
  2. Utilizza long polling (20s) per ricevere messaggi. Se un messaggio non corrisponde ai criteri (o non è purge-all), ne azzera la visibilità (RELEASE) per altri consumer.
  3. Esegue eliminazioni/rilasci in batch di 10 messaggi (limite AWS) per ottimizzare performance e costi.
- **Sicurezza e Idempotenza**:
  - **ReceiptHandle vs MessageId**: Utilizza il `MessageId` per il matching nel file di input, ma il `ReceiptHandle` corrente per l'eliminazione effettiva.
  - **Idempotenza**: Il design gestisce la ricezione duplicata; se un messaggio è già stato rimosso, l'eliminazione fallirà silenziosamente senza causare errori.
  - **Heartbeat**: Estende dinamicamente il timeout di visibilità dei messaggi in-flight per prevenire elaborazioni duplicate durante il processing.
  - **Best Practice**: I messaggi non eliminati vengono rilasciati immediatamente (timeout = 0) per minimizzare l'impatto sulla coda.

## Troubleshooting

- **Errore: "Queue not found"**: Verificare il nome coda o l'URL.
- **Supporto**: Contattare il Team GO - Gestione Operativa.
