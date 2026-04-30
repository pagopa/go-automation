# AWS Put SQS

> Versione: 1.1.0 | Maintainer: Team GO - Gestione Operativa | Ultima modifica: 2026-04-22

Script progettato per l'invio massivo (bulk) di messaggi a una coda **Amazon SQS**. Supporta code standard e FIFO, implementando logiche di batching e retry per garantirne affidabilità e prestazioni.

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

Invio massivo di messaggi a code SQS standard o FIFO, con gestione ottimizzata di batching, retry e deduplicazione automatica per code FIFO.

## Prerequisiti

- **Software**: Node.js (>= 22.0.0), pnpm (>= 10.0.0).
- **Accesso**: Profilo AWS SSO attivo (`aws sso login --profile <nome>`).
- **Permessi**: `sqs:SendMessage`, `sqs:SendMessageBatch`, `sqs:GetQueueAttributes`.

## Configurazione

### Parametri CLI

| Parametro         | Alias | Obbligatorio | Default | Descrizione                                        |
|-------------------|-------|--------------|---------|----------------------------------------------------|
| `--aws-profile`   | `-ap` | Sì           | -       | Nome del profilo AWS SSO.                          |
| `--input-file`    | `-f`  | Sì           | -       | Percorso file sorgente (txt, json, csv).           |
| `--queue-name`    | `-qn` | No           | -       | Nome coda SQS (se non si fornisce `--queue-url`).  |
| `--delay-seconds` | `-ds` | No           | `0`     | Ritardo in secondi (0-900).                        |

## Utilizzo

*Esempi di comandi standardizzati per scenari comuni.*

- **Scenario A: Invio messaggi da file testo**

```bash
pnpm --filter=aws-put-sqs start --qn <coda> -f messaggi.txt --ap <profilo>
```

- **Scenario B: Invio a coda FIFO con deduplicazione**

```bash
pnpm --filter=aws-put-sqs start --qn <coda.fifo> -f msg.json --fds hash --fgid <group-id> --ap <profilo>
```

## Output

- **Artifacts**: Nessun file generato.
- **Console output**: Riepilogo esecuzione (totale processati, inviati, falliti, retry effettuati).

## Funzionamento e Sicurezza

*Informazioni per PR reviewers e operatori.*

- **Logica Operativa**:
  1. Identifica automaticamente se la coda è FIFO.
  2. Legge input in streaming, raggruppa in batch di 10 (limite AWS).
  3. Invia batch; in caso di fallimento parziale, riesegue i singoli messaggi falliti con backoff esponenziale.
- **Azioni Distruttive**: Sì, scrive dati nella coda SQS.
- **Resilienza ai fallimenti**: Implementa retry con backoff esponenziale per messaggi falliti.
- **Idempotenza**: Per code FIFO, genera automaticamente `MessageDeduplicationId` tramite hash SHA-256 del contenuto se richiesto (`--fds hash`).
- **Validazione**: Valida la dimensione dei messaggi (< 256KB) e rigetta messaggi vuoti prima dell'invio.

## Troubleshooting

- **Errore: "Message too long"**: Il corpo del messaggio supera il limite SQS di 256KB.
- **Supporto**: Contattare il Team GO - Gestione Operativa.
