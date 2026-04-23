# SEND Put SQS

> Versione: 1.1.0 | Autore: Team GO

Script progettato per l'invio massivo (bulk) di messaggi a una coda **Amazon SQS**. Supporta code standard e FIFO, implementando logiche di batching e retry per garantirne affidabilità e prestazioni.

## Indice

- [Come funziona](#come-funziona)
- [Prerequisiti](#prerequisiti)
- [Configurazione](#configurazione)
- [Formati Supportati](#formati-supportati)
- [Gestione Errori](#gestione-errori)
- [Utilizzo](#utilizzo)

---

## Come funziona

1. **Inizializzazione**: risolve l'URL della coda (accetta nome o URL) e rileva automaticamente se si tratta di una coda **FIFO**.
2. **Lettura Messaggi**: legge i messaggi dal file di input specificato utilizzando streaming a basso consumo di memoria.
3. **Batching**: raggruppa i messaggi in batch di massimo 10 elementi (limite AWS SQS) per ottimizzare i costi e le performance.
4. **Retry**: in caso di fallimento parziale di un batch, lo script re-invia **solo i singoli messaggi falliti**, evitando duplicati non necessari (best practice AWS).
5. **Supporto FIFO**: gestisce automaticamente `MessageGroupId` e può generare `MessageDeduplicationId` tramite hash SHA-256 del contenuto.

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

Lo script accetta parametri tramite CLI. Le path relative vengono risolte tramite `GOPaths`.

### Parametri CLI

| Parametro                       | Alias             | Tipo     | Obbligatorio | Default   | Descrizione                                                                  |
| ------------------------------- | ----------------- | -------- | ------------ | --------- | ---------------------------------------------------------------------------- |
| `--aws-profile`                 | `--ap`            | `string` | Sì           | —         | Nome del profilo AWS SSO                                                     |
| `--queue-url`                   | `--qu`, `--url`   | `string` | No           | —         | URL completo della coda SQS (Obbligatorio se non si fornisce `--queue-name`) |
| `--queue-name`                  | `--qn`            | `string` | No           | —         | Nome della coda SQS (Obbligatorio se non si fornisce `--queue-url`)          |
| `--input-file`                  | `-f`, `--input`   | `string` | Sì           | —         | Percorso del file sorgente contenente i messaggi                             |
| `--file-format`                 | `--ff`            | `enum`   | No           | `auto`    | Formato del file (`text`, `json`, `csv`)                                     |
| `--csv-column`                  | `--cc`            | `string` | No           | `message` | Nome della colonna CSV contenente il corpo del messaggio                     |
| `--delay-seconds`               | `--ds`, `--delay` | `number` | No           | `0`       | Ritardo in secondi (0-900). Alias: `--visibility.timeout`                    |
| `--batch-size`                  | `--bs`            | `number` | No           | `10`      | Numero massimo di messaggi per batch (max 10)                                |
| `--batch-max-retries`           | `--mr`            | `number` | No           | `3`       | Numero massimo di tentativi per messaggi falliti in un batch                 |
| `--fifo-group-id`               | `--fgid`          | `string` | No           | —         | Message Group ID per code FIFO                                               |
| `--fifo-deduplication-strategy` | `--fds`           | `enum`   | No           | `content` | Strategia dedup FIFO (`content` o `hash`)                                    |

---

## Formati Supportati

- **Text (`.txt`)**: Ogni riga del file viene inviata come un messaggio separato.
- **JSON (`.json`)**: Deve contenere un array di oggetti o stringhe. Se sono oggetti, vengono convertiti in stringhe JSON. Supporta anche formato JSONL (uno per riga).
- **CSV (`.csv`)**: Utilizza la colonna specificata (default: `message`) come corpo del messaggio.

---

## Gestione Errori

In caso di errori:

- Se SQS restituisce errori per alcuni messaggi all'interno di un batch, lo script isola solo quei messaggi e li riprova con un backoff esponenziale.
- Al termine, viene presentato un riepilogo con:
  - Totale messaggi processati.
  - Messaggi inviati con successo.
  - Messaggi falliti permanentemente (dopo tutti i tentativi).
  - Numero totale di tentativi di retry effettuati.

## Validazione Input

Lo script esegue controlli automatici sui messaggi prima dell'invio:

- **Limite Dimensione**: Ogni messaggio viene validato per assicurarsi che non superi il limite di 256KB di SQS.
- **Messaggi Vuoti**: I messaggi con corpo vuoto vengono rigettati.
- **Formato**: I dati in formato JSON/CSV vengono convertiti correttamente e validati prima dell'invio. Se un messaggio fallisce la validazione, il batch corrente viene interrotto per prevenire inserimenti corrotti.

---

## Utilizzo

```bash
# Invio semplice da file di testo (usando nome coda)
pnpm --filter=send-put-sqs start --qn la-mia-coda -f messaggi.txt --ap mio-profilo

# Invio da CSV specificando la colonna e ritardo di visibilità (usando URL)
pnpm --filter=send-put-sqs start --qu https://sqs... -f data.csv --cc body --ds 60 --ap mio-profilo

# Invio a coda FIFO con generazione hash per deduplicazione
pnpm --filter=send-put-sqs start --qn coda.fifo -f msg.json --fds hash --fgid my-group --ap mio-profilo

# Re-invio di messaggi scaricati tramite send-dump-sqs (formato NDJSON)
pnpm --filter=send-put-sqs start --qn la-mia-coda -f dump_coda_2026-04-17.ndjson --ap mio-profilo
```

---

**Ultima modifica**: 2026-04-22
**Maintainer**: Team GO - Gestione Operativa
