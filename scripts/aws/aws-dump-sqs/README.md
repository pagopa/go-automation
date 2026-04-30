# AWS Dump SQS

> Versione: 1.1.0 | Maintainer: Team GO - Gestione Operativa | Ultima modifica: 2026-04-22

Script che effettua il dump di tutti i messaggi presenti in una coda **SQS** in formato **NDJSON**. Lo script opera in modalità **read-only**: i messaggi vengono ricevuti ma **NON** eliminati dalla coda.

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

Dump massivo di messaggi SQS in formato NDJSON per analisi offline, garantendo la persistenza dei messaggi nella coda sorgente.

## Prerequisiti

- **Software**: Node.js (>= 22.0.0), pnpm (>= 10.0.0).
- **Accesso**: Profilo AWS SSO attivo (`aws sso login --profile <nome>`).
- **Permessi**: `sqs:ReceiveMessage`, `sqs:GetQueueAttributes`.

## Configurazione

### Parametri CLI

| Parametro        | Alias | Obbligatorio | Default      | Descrizione                                                      |
|------------------|-------|--------------|--------------|------------------------------------------------------------------|
| `--aws-profile`  | `-ap` | Sì           | -            | Nome del profilo AWS SSO.                                        |
| `--queue-name`   | `-qn` | No           | -            | Nome della coda SQS (se non si fornisce `--queue-url`).          |
| `--dedup-mode`   | `-dm` | No           | `message-id` | Modalità di deduplicazione: `message-id`, `content-md5`, `none`. |
| `--limit`        | `-l`  | No           | -            | Numero massimo di messaggi da scaricare.                         |

## Utilizzo

*Esempi di comandi standardizzati per scenari comuni.*

- **Scenario A: Dump standard**

```bash
pnpm --filter=aws-dump-sqs start --qn <coda> --ap <profilo>
```

- **Scenario B: Dump con deduplicazione contenuto**

```bash
pnpm --filter=aws-dump-sqs start --qn <coda> --dm content-md5 --ap <profilo>
```

## Output

- **Artifacts**: File `.ndjson` salvati in `data/aws-dump-sqs/outputs/aws-dump-sqs_<timestamp>/`.
- **Console output**: Report in tempo reale del numero di messaggi scaricati e deduplicati.

## Funzionamento e Sicurezza

*Informazioni per PR reviewers e operatori.*

- **Logica Operativa**:
  1. Recupera attributi coda (dimensione, tipo) e avvisa su superamento limiti "in-flight".
  2. Utilizza long polling (20s) per interrogare tutti i server SQS.
  3. Applica deduplicazione in memoria e scrive ogni messaggio unico nel file di output.
  4. Termina automaticamente dopo un numero configurabile di poll vuoti (default: 3).
- **Azioni Distruttive**: Nessuna. Lo script è strettamente read-only.
- **Resilienza ai fallimenti**: Gestisce correttamente la terminazione per garantire la scrittura dell'intero buffer.
- **Idempotenza**: Non applicabile (read-only).
- **Limitazioni**: Attenzione ai limiti SQS "in-flight" (120k standard, 20k FIFO) e all'utilizzo RAM per dump massivi con deduplicazione abilitata.

## Troubleshooting

- **Errore: "In-flight limit exceeded"**: Il dump sta superando la capacità SQS; attendere la scadenza del visibility timeout dei messaggi.
- **Supporto**: Contattare il Team GO - Gestione Operativa.
