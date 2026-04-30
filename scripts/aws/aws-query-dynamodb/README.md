# AWS Query DynamoDB

> Versione: 1.0.0 | Maintainer: Team GO - Gestione Operativa | Ultima modifica: 2026-04-23

Script di automazione per il recupero di dati da tabelle DynamoDB tramite Partition Key. Supporta input multipli, proiezione di attributi, indici secondari (GSI/LSI) e diversi formati di output.

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

Recupero dati da tabelle DynamoDB tramite Partition Key, con supporto per proiezioni, indici secondari e gestione robusta di grandi dataset.

## Prerequisiti

- **Software**: Node.js (>= 22.14.0), pnpm (>= 10.0.0).
- **Accesso**: Profilo AWS SSO attivo (`aws sso login --profile <nome>`).
- **Permessi**: `dynamodb:DescribeTable`, `dynamodb:Query`.

## Configurazione

### Parametri CLI

| Parametro         | Alias   | Obbligatorio | Default  | Descrizione                                             |
|-------------------|---------|--------------|----------|---------------------------------------------------------|
| `--aws-profile`   | `-ap`   | Sì           | -        | Nome del profilo AWS SSO.                               |
| `--table-name`    | `-table`| Sì           | -        | Nome della tabella DynamoDB da interrogare.             |
| `--table-key`     | `-key`  | Sì           | -        | Nome dell'attributo Partition Key.                      |
| `--input-file`    | `-input`| No           | -        | Percorso file input (TXT, JSONL, CSV).                  |
| `--failure-mode`  | `-fm`   | No           | `report` | Policy errori: `abort`, `report`, `ignore`.             |

## Utilizzo

*Esempi di comandi standardizzati per scenari comuni.*

- **Scenario A: Query per singola PK**

```bash
pnpm aws:query:dynamodb:dev --aws-profile <profilo> --table-name <tabella> --table-key <pk> --input-pks "PK_VAL"
```

- **Scenario B: Query da file CSV**

```bash
pnpm aws:query:dynamodb:dev --aws-profile <profilo> --table-name <tabella> --table-key <pk> --input-file <file.csv> --input-format csv
```

## Output

- **Artifacts**: Risultati salvati in `results.json` e `failures.json` (se applicabile) in `data/aws-query-dynamodb/outputs/...`.
- **Console output**: Oggetto JSON con il mapping tra PK input e item trovati.

## Gestione Errori e Sicurezza

*Informazioni per PR reviewers e operatori.*

- **Azioni Distruttive**: Nessuna (read-only).
- **Failure Mode**:
  - `abort`: Interrompe la batch al primo errore.
  - `report`: Completa tutte le query e genera `failures.json`.
  - `ignore`: Completa tutte le query e non blocca l'exit code.
- **Resilienza ai fallimenti**: Implementa backoff esponenziale per errori `ProvisionedThroughputExceeded`.
- **Idempotenza**: Sola lettura, quindi intrinsecamente idempotente.

## Troubleshooting

- **Errore: "Table/Index requires a sort key"**: La tabella ha una Sort Key definita; usare `--table-sort-key` e `--table-sort-value`.
- **Supporto**: Contattare il Team GO - Gestione Operativa.
