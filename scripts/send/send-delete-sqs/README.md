# SEND Delete SQS

> Versione: 1.0.0 | Autore: Team GO

Script progettato per l'eliminazione sicura e resiliente di messaggi da una coda **Amazon SQS**. Supporta sia l'eliminazione mirata tramite un file di input (prodotto da `send-dump-sqs`) sia il purge completo della coda, seguendo rigorosamente le best practice AWS per il ciclo di vita dei messaggi.

## Indice

- [Come funziona](#come-funziona)
- [Prerequisiti](#prerequisiti)
- [Configurazione](#configurazione)
- [Sicurezza e Best Practices](#sicurezza-e-best-practices)
- [Utilizzo](#utilizzo)

---

## Come funziona

1. **Inizializzazione**: risolve l'URL della coda e valida i parametri di input. Richiede obbligatoriamente `--input-file` o `--purge-all`.
2. **Conferma Obbligatoria**: richiede una conferma interattiva prima di procedere con qualsiasi operazione di eliminazione.
3. **Matching (Targeted Delete)**: se viene fornito un file NDJSON, lo script carica i `MessageId` in memoria.
4. **Consumer Loop**: utilizza il long polling (20s) per ricevere i messaggi in batch.
   - se un messaggio corrisponde ai criteri (o in modalità `purge-all`), viene aggiunto al batch di eliminazione (**DELETE**).
   - se un messaggio NON corrisponde, la sua visibilità viene azzerata immediatamente (**RELEASE**) per renderlo disponibile ad altri consumer.
5. **Heartbeat**: durante l'elaborazione di batch complessi, estende dinamicamente il timeout di visibilità dei messaggi in-flight per prevenire elaborazioni duplicate.
6. **Batch Operations**: esegue eliminazioni e rilasci in batch di 10 (limite AWS) per ottimizzare performance e costi.

---

## Prerequisiti

### Software

| Software | Versione minima | Note            |
| -------- | --------------- | --------------- |
| Node.js  | >= 22.14.0      | LTS consigliata |
| pnpm     | >= 10.0.0       | Package manager |

### Credenziali AWS

La sessione SSO deve essere attiva per il profilo AWS utilizzato.

```bash
aws sso login --profile <nome-profilo>
```

---

## Configurazione

Lo script accetta parametri tramite CLI. Le path relative vengono risolte tramite `GOPaths`.

### Parametri CLI

| Parametro              | Alias           | Tipo      | Obbligatorio | Default | Descrizione                                                                  |
| ---------------------- | --------------- | --------- | ------------ | ------- | ---------------------------------------------------------------------------- |
| `--aws-profile`        | `--ap`          | `string`  | Sì           | —       | Nome del profilo AWS SSO                                                     |
| `--queue-name`         | `--qn`          | `string`  | No           | —       | Nome della coda SQS (Obbligatorio se non si fornisce `--queue-url`)          |
| `--queue-url`          | `--qu`, `--url` | `string`  | No           | —       | URL completo della coda SQS (Obbligatorio se non si fornisce `--queue-name`) |
| `--input-file`         | `-f`, `--input` | `string`  | No           | —       | Percorso del file NDJSON contenente i messaggi da eliminare                  |
| `--purge-all`          | `--purge`       | `boolean` | No           | `false` | Se `true`, elimina TUTTI i messaggi presenti nella coda                      |
| `--visibility-timeout` | `--vt`          | `number`  | No           | `30`    | Timeout di visibilità iniziale (in secondi) per i messaggi ricevuti          |
| `--batch-size`         | `--bs`          | `number`  | No           | `10`    | Numero di messaggi da processare in parallelo (max 10)                       |
| `--max-empty-receives` | `--mer`         | `number`  | No           | `3`     | Numero di poll vuoti consecutivi prima di considerare la coda scarica        |

---

## Sicurezza e Best Practices

- **ReceiptHandle vs MessageId**: lo script utilizza il `MessageId` per identificare i messaggi nel file di input (identificativo stabile), ma utilizza sempre il `ReceiptHandle` più recente ottenuto dalla ricezione corrente per l'eliminazione effettiva.
- **Idempotenza**: il design gestisce nativamente la ricezione duplicata. Se un messaggio viene ricevuto due volte, l'eliminazione tramite il secondo handle fallirà silenziosamente (già rimosso), garantendo la coerenza.
- **Rilascio Immediato**: i messaggi che non devono essere eliminati vengono rilasciati immediatamente (timeout = 0), riducendo al minimo l'impatto sulla latenza della coda e su altri consumer.
- **Long Polling**: riduce le chiamate API a vuoto e i costi operativi, garantendo al contempo di interrogare tutti i server SQS.

---

## Utilizzo

```bash
# Eliminazione mirata basata su un dump precedente
pnpm --filter=send-delete-sqs start --qn la-mia-coda -f dump_coda_2025-05-22.ndjson --ap mio-profilo

# Purge completo della coda (richiede conferma interattiva)
pnpm --filter=send-delete-sqs start --qn la-mia-coda --purge-all --ap mio-profilo

# Esecuzione con timeout di visibilità personalizzato
pnpm --filter=send-delete-sqs start --qn la-mia-coda --purge-all --vt 60 --ap mio-profilo
```

---

**Ultima modifica**: 2025-05-22
**Maintainer**: Team GO - Gestione Operativa
