# SEND Dump SQS

> Versione: 1.1.0 | Autore: Team GO

Script che effettua il dump di tutti i messaggi presenti in una coda **SQS** in formato **NDJSON**. Lo script opera in modalità **read-only**: i messaggi vengono ricevuti ma **NON** vengono eliminati dalla coda.

## Indice

- [Come funziona](#come-funziona)
- [Prerequisiti](#prerequisiti)
- [Configurazione](#configurazione)
- [Deduplicazione](#deduplicazione)
- [Utilizzo](#utilizzo)
- [Limitazioni Importanti](#limitazioni-importanti)

---

## Come funziona

1. **Inizializzazione** — Recupera l'URL e gli attributi della coda (dimensione, tipo FIFO) utilizzando il profilo e la regione specificati. Mostra un warning se la dimensione supera i limiti di messaggi "in-flight" di SQS.
2. **Long Polling** — Utilizza il long polling (20 secondi) per ridurre le risposte vuote e interrogare tutti i server SQS distribuite.
3. **Ricezione e Deduplicazione** — Riceve messaggi in batch e applica la logica di deduplicazione scelta (default: `message-id`).
4. **Export NDJSON** — Ogni messaggio unico viene salvato in una riga del file di output.
5. **Terminazione Robusta** — Lo script termina solo dopo un numero configurabile di risposte vuote consecutive (default: 3), per garantire di aver scansionato l'intera coda.

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

Lo script non include un file di configurazione dedicato: i valori vengono passati da CLI e le eventuali path relative vengono risolte tramite `GOPaths`.

### Parametri CLI

| Parametro              | Alias   | Tipo     | Obbligatorio | Default      | Descrizione                                                                                               |
| ---------------------- | ------- | -------- | ------------ | ------------ | --------------------------------------------------------------------------------------------------------- |
| `--aws-profile`        | `--ap`  | `string` | Sì           | —            | Nome del profilo AWS SSO                                                                                  |
| `--queue-name`         | `--qn`  | `string` | Sì           | —            | Nome della coda SQS                                                                                       |
| `--visibility-timeout` | `--vt`  | `number` | No           | `60`         | Timeout di visibilità per i messaggi ricevuti                                                             |
| `--limit`              | `-l`    | `number` | No           | —            | Numero massimo di messaggi da scaricare                                                                   |
| `--dedup-mode`         | `--dm`  | `enum`   | No           | `message-id` | Modalità di deduplicazione (`message-id`, `content-md5`, `none`)                                          |
| `--max-empty-receives` | `--mer` | `number` | No           | `3`          | Poll vuoti consecutivi prima di fermarsi                                                                  |
| `--output-file`        | `-o`    | `string` | No           | —            | Percorso personalizzato del file di output (assoluto o relativo alla directory di output dell'esecuzione) |

### Note di risoluzione path

- Se `--output-file` e assoluto, viene usato cosi com'e
- Se `--output-file` e relativo, viene salvato nella directory `data/send-dump-sqs/outputs/send-dump-sqs_<timestamp>/`
- Se `--output-file` non e specificato, il nome viene generato automaticamente come `dump_<queue>_<timestamp>.ndjson`

---

## Deduplicazione

Dato che i messaggi non vengono eliminati, lo script potrebbe ricevere lo stesso messaggio più volte se il `visibility-timeout` scade prima della fine del dump.

- **`message-id`** (Default): Filtra i duplicati tecnici. Se lo stesso identico messaggio SQS viene ricevuto due volte, viene salvato solo una volta.
- **`content-md5`**: Filtra i duplicati di contenuto. Se ci sono messaggi diversi con lo stesso corpo e attributi, viene salvato solo il primo incontrato.
- **`none`**: Nessun filtro. Ogni messaggio ricevuto viene scritto nel file.

---

## Limitazioni Importanti

- **In-Flight Messages**: SQS ha un limite di messaggi "in-flight" (ricevuti ma non eliminati): **120.000** per code standard, **20.000** per code FIFO. Se il dump supera questi limiti, SQS smetterà di restituire messaggi finché i timeout di visibilità non scadono.
- **Deduplicazione in Memoria**: La deduplicazione avviene in memoria RAM. Per dump di milioni di messaggi, monitorare l'utilizzo della memoria.
- **Standard vs FIFO**: Nelle code standard l'ordinamento non è garantito e la deduplicazione `content-md5` potrebbe non essere deterministica se i messaggi variano leggermente.

---

## Utilizzo

```bash
# Dump standard con deduplicazione per MessageId
pnpm --filter=send-dump-sqs start --qn la-mia-coda --aws-profile mio-profilo

# Dump con filtro sul contenuto (MD5)
pnpm --filter=send-dump-sqs start --qn la-mia-coda --dm content-md5 --aws-profile mio-profilo

# Dump veloce con limite di messaggi
pnpm --filter=send-dump-sqs start --qn la-mia-coda -l 1000 --aws-profile mio-profilo
```

---

**Ultima modifica**: 2026-04-17
**Maintainer**: Team GO - Gestione Operativa
