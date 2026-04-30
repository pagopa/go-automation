# AWS Redrive SQS

> Versione: 1.0.0 | Maintainer: Team GO - Gestione Operativa | Ultima modifica: 2026-04-28

Script che permette di spostare i messaggi da una coda **SQS** di origine a una coda di destinazione. Lo script garantisce la parità di tipo (FIFO o Standard) e preserva gli attributi dei messaggi durante il trasferimento.

## Indice

- [Obiettivo](#obiettivo)
- [Prerequisiti](#prerequisiti)
- [Configurazione](#configurazione)
- [Utilizzo](#utilizzo)
- [Output](#output)
- [Gestione Errori e Sicurezza](#gestione-errori-e-sicurezza)
- [Troubleshooting](#troubleshooting)

---

## Obiettivo

Spostamento affidabile di messaggi tra code SQS (Standard o FIFO), preservando gli attributi originali e garantendo l'integrità del trasferimento.

## Prerequisiti

- **Software**: Node.js (>= 22.0.0), pnpm (>= 10.0.0).
- **Accesso**: Profilo AWS SSO attivo (`aws sso login --profile <nome>`).
- **Permessi**: `sqs:ReceiveMessage`, `sqs:DeleteMessage` (origine), `sqs:SendMessage` (destinazione).

## Configurazione

### Parametri CLI

| Parametro        | Alias  | Obbligatorio | Default | Descrizione                                           |
| ---------------- | ------ | ------------ | ------- | ----------------------------------------------------- |
| `--aws-profile`  | `-ap`  | Sì           | -       | Nome del profilo AWS SSO.                             |
| `--source-queue` | `-src` | Sì           | -       | Nome o URL della coda origine.                        |
| `--target-queue` | `-dst` | Sì           | -       | Nome o URL della coda destinazione.                   |
| `--dry-run`      | `-dr`  | No           | `false` | Simula l'operazione senza inviare/eliminare messaggi. |

## Utilizzo

_Esempi di comandi standardizzati per scenari comuni._

- **Scenario A: Spostamento completo**

```bash
pnpm --filter=aws-redrive-sqs start --src <coda-origine> --dst <coda-destinazione> --ap <profilo>
```

- **Scenario B: Spostamento limitato con alta concorrenza**

```bash
pnpm --filter=aws-redrive-sqs start --src <coda-origine> --dst <coda-destinazione> --lm 100 --cc 4 --ap <profilo>
```

## Output

- **Artifacts**: Nessun file generato.
- **Console output**: Report in tempo reale dell'avanzamento dello spostamento.

## Gestione Errori e Sicurezza

_Informazioni per PR reviewers e operatori._

- **Azioni Distruttive**: Sì, elimina i messaggi dalla coda di origine DOPO aver confermato l'invio alla destinazione.
- **Resilienza ai fallimenti**: In caso di errore durante l'invio, il messaggio non viene eliminato dall'origine, rendendo l'operazione sicura.
- **Idempotenza**: Per code FIFO, genera automaticamente `MessageDeduplicationId` tramite hash SHA-256 del contenuto se non presente.
- **Limitazioni**: Non è possibile spostare messaggi tra tipi diversi (Standard vs FIFO).

## Troubleshooting

- **Errore: "Mismatch di Tipo"**: Le code di origine e destinazione devono essere entrambe Standard o entrambe FIFO.
- **Supporto**: Contattare il Team GO - Gestione Operativa.
