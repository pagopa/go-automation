# AWS Redrive SQS

> Versione: 1.0.0 | Autore: Team GO

Script che permette di spostare i messaggi da una coda **SQS** di origine a una coda di destinazione. Lo script garantisce la parità di tipo (FIFO o Standard) e preserva gli attributi dei messaggi durante il trasferimento.

## Indice

- [AWS Redrive SQS](#aws-redrive-sqs)
  - [Indice](#indice)
  - [Come funziona](#come-funziona)
  - [Prerequisiti](#prerequisiti)
    - [Software](#software)
    - [Credenziali AWS](#credenziali-aws)
  - [Configurazione](#configurazione)
    - [Parametri CLI](#parametri-cli)
  - [Limitazioni Importanti](#limitazioni-importanti)
  - [Utilizzo](#utilizzo)

---

## Come funziona

1. **Validazione Code**: Lo script risolve i metadati di entrambe le code (origine e destinazione) e verifica che siano dello stesso tipo (entrambe Standard o entrambe FIFO).
2. **Move Resiliente**: I messaggi vengono ricevuti dalla coda di origine, inviati in batch a quella di destinazione e, solo in caso di successo dell'invio, eliminati dall'origine.
3. **Preservazione Attributi**: Durante lo spostamento vengono mantenuti tutti i `MessageAttributes`. Per le code FIFO, vengono preservati anche `MessageGroupId` e `MessageDeduplicationId`.
4. **Batch Processing**: Utilizza operazioni batch (fino a 10 messaggi alla volta) per ottimizzare le performance e ridurre i costi.
5. **Dry Run**: È possibile simulare l'operazione senza effettuare effettivamente l'invio o l'eliminazione dei messaggi.

---

## Prerequisiti

### Software

| Software | Versione minima | Note            |
| -------- | --------------- | --------------- |
| Node.js  | >= 22.0.0       | LTS consigliata |
| pnpm     | >= 10.0.0       | Package manager |

### Credenziali AWS

La sessione SSO deve essere attiva per il profilo AWS utilizzato.

```bash
aws sso login --profile <nome-profilo>
```

---

## Configurazione

Lo script accetta parametri tramite interfaccia CLI.

### Parametri CLI

| Parametro              | Alias           | Tipo      | Obbligatorio | Default | Descrizione                                                                               |
| ---------------------- | --------------- | --------- | ------------ | ------- | ----------------------------------------------------------------------------------------- |
| `--aws-profile`        | `--ap`          | `string`  | Sì           | —       | Nome del profilo AWS SSO                                                                  |
| `--source-queue`       | `--sq`, `--src` | `string`  | Sì           | —       | Nome o URL completo della coda SQS di origine                                             |
| `--target-queue`       | `--tq`, `--dst` | `string`  | Sì           | —       | Nome o URL completo della coda SQS di destinazione                                        |
| `--visibility-timeout` | `--vt`          | `number`  | No           | `60`    | Timeout di visibilità per i messaggi ricevuti (0-43200 secondi)                           |
| `--limit`              | `--lm`          | `number`  | No           | —       | Numero massimo di messaggi da spostare (intero positivo)                                  |
| `--batch-size`         | `--bs`          | `number`  | No           | `10`    | Dimensione del batch per le operazioni SQS (1-10)                                         |
| `--max-empty-receives` | `--mer`         | `number`  | No           | `3`     | Numero di poll vuoti consecutivi prima di terminare (con long-poll a 20s, ~ valore × 20s) |
| `--concurrency`        | `--cc`          | `number`  | No           | `1`     | Worker pool paralleli (1 = sequenziale; con >1 il `--limit` diventa approssimato)         |
| `--dry-run`            | `--dr`          | `boolean` | No           | `false` | Simula lo spostamento senza inviare o eliminare i messaggi (`VisibilityTimeout: 0`)       |

---

## Limitazioni Importanti

- **Mismatch di Tipo**: Non è possibile spostare messaggi tra una coda Standard e una FIFO (o viceversa).
- **FIFO Queues**: Per le code FIFO, se il corpo di un messaggio nell'origine non ha un hash MD5 coincidente con il `MessageDeduplicationId` originale (e questo non è presente negli attributi), lo script ricalcola l'hash per garantire la consegna.
- **Permessi IAM**: L'utente deve avere i permessi `sqs:ReceiveMessage`, `sqs:DeleteMessage` sulla coda di origine e `sqs:SendMessage` sulla coda di destinazione.

---

## Utilizzo

```bash
# Spostamento completo tra due code
pnpm --filter=aws-redrive-sqs start --src coda-origine --dst coda-destinazione --aws-profile mio-profilo

# Simulazione dello spostamento (Dry Run)
pnpm --filter=aws-redrive-sqs start --src coda-origine --dst coda-destinazione --dr --aws-profile mio-profilo

# Spostamento limitato a 100 messaggi
pnpm --filter=aws-redrive-sqs start --src coda-origine --dst coda-destinazione --lm 100 --aws-profile mio-profilo

# Redrive ad alta concorrenza (4 worker paralleli) per DLQ con molti messaggi
pnpm --filter=aws-redrive-sqs start --src coda-origine --dst coda-destinazione --cc 4 --aws-profile mio-profilo
```

---

**Ultima modifica**: 2026-04-28
**Maintainer**: Team GO - Gestione Operativa
