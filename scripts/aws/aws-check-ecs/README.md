# AWS Check ECS

> Versione: 1.0.0 | Maintainer: Team GO - Gestione Operativa | Ultima modifica: 2026-03-24

Script di automazione per il monitoraggio dello stato di cluster, servizi e task ECS su AWS.

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

Script di automazione per il monitoraggio dello stato di cluster, servizi e task ECS su AWS.

## Prerequisiti

- **Software**: Node.js (>= 22.14.0), pnpm (>= 10.0.0).
- **Accesso**: Profilo AWS SSO attivo (`aws sso login --profile <nome>`).
- **Permessi**: `ecs:ListClusters`, `ecs:DescribeClusters`, `ecs:ListServices`, `ecs:DescribeServices`, `ecs:ListTasks`, `ecs:DescribeTasks`.

## Configurazione

### Parametri CLI

| Parametro        | Alias  | Obbligatorio | Default    | Descrizione                                      |
| ---------------- | ------ | ------------ | ---------- | ------------------------------------------------ |
| `--aws-profiles` | `-aps` | Sì           | -          | Nomi dei profili AWS SSO (separati da virgola).  |
| `--aws-region`   | `-r`   | No           | eu-south-1 | Regione AWS per le operazioni.                   |
| `--ecs-clusters` | `-c`   | No           | -          | Nomi o parti di nomi dei cluster da controllare. |

## Utilizzo

_Esempi di comandi standardizzati per scenari comuni._

- **Scenario A: Controllo di tutti i cluster su profili multipli**

```bash
pnpm aws:check:ecs:dev --aws-profiles <profile1>,<profile2>
```

- **Scenario B: Controllo di cluster specifici su profilo singolo**

```bash
pnpm aws:check:ecs:prod --aws-profiles <profile1> --ecs-clusters <cluster-name>
```

## Output

- **Artifacts**: Nessun file di output.
- **Console output**:

```text
╭─────────────────────────────────────────╮
│  AWS Check ECS v1.0.0                   │
╰─────────────────────────────────────────╯

► Profile: sso_pn-core-prod
  Cluster: pn-core-prod (HEALTHY)
  ...
```

## Gestione Errori e Sicurezza

_Informazioni per PR reviewers e operatori._

- **Azioni Distruttive**: Nessuna azione distruttiva.
- **Resilienza ai fallimenti**: Lo script gestisce errori di connessione e limita le chiamate API per evitare throttling.
- **Idempotenza**: Lo script è di sola lettura (read-only).

## Troubleshooting

- **Errore: "AWS credentials not found"**: Profilo AWS non configurato o sessione SSO scaduta. Eseguire `aws sso login --profile <nome-profilo>`.
- **Supporto**: Contattare il Team GO - Gestione Operativa.
