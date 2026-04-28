# AWS Check ECS

> Versione: 1.0.0 | Autore: Team GO - Gestione Operativa

Script di automazione per il monitoraggio dello stato di cluster, servizi e task ECS su AWS.

## Indice

- [Funzionalità](#funzionalità)
- [Prerequisiti](#prerequisiti)
- [Configurazione](#configurazione)
- [Utilizzo](#utilizzo)
- [Output](#output)
- [Troubleshooting](#troubleshooting)

## Funzionalità

Lo script esegue le seguenti operazioni:

- Discovery dei cluster ECS (tutti o filtrati per nome).
- Analisi dello stato dei servizi (Running vs Desired count).
- Verifica dello stato di salute dei task (Last Status e Health Status).
- Report consolidato per account/profilo AWS.

## Prerequisiti

### Software Richiesto

| Software   | Versione Minima | Note                 |
| ---------- | --------------- | -------------------- |
| Node.js    | >= 22.14.0      | LTS consigliata      |
| pnpm       | >= 10.0.0       | Package manager      |
| TypeScript | >= 5.0.0        | Incluso nel progetto |

### Account e Permessi

- [ ] Accesso AWS con profilo SSO configurato.
- [ ] Permessi IAM per `ecs:ListClusters`, `ecs:DescribeClusters`, `ecs:ListServices`, `ecs:DescribeServices`, `ecs:ListTasks`, `ecs:DescribeTasks`.

## Configurazione

### Parametri CLI

| Parametro        | Alias  | Tipo   | Obbligatorio | Default    | Descrizione                                      |
| ---------------- | ------ | ------ | ------------ | ---------- | ------------------------------------------------ |
| `--aws-profiles` | `-aps` | array  | Si           | -          | Nomi dei profili AWS SSO (separati da virgola).  |
| `--aws-region`   | `-r`   | string | No           | eu-south-1 | Regione AWS per le operazioni.                   |
| `--ecs-clusters` | `-c`   | array  | No           | -          | Nomi o parti di nomi dei cluster da controllare. |

## Utilizzo

### Modalità Development (via pnpm/tsx)

```bash
pnpm aws:check:ecs:dev --aws-profiles <profile1>,<profile2>
```

### Modalità Production (build + node)

```bash
pnpm aws:check:ecs:prod --aws-profiles <profile1>
```

## Output

### Esempio Output Console

```console
╭─────────────────────────────────────────╮
│  AWS Check ECS v1.0.0                   │                  │
│  Team GO - Gestione Operativa           │
╰─────────────────────────────────────────╯

► ECS Check
  Profiles: sso_pn-core-prod
  Region: eu-south-1
  Target Clusters: ALL

► Profile: sso_pn-core-prod

  Cluster: pn-core-prod (HEALTHY)
  Status: ACTIVE
  ARN: arn:aws:ecs:eu-south-1:123456789:cluster/pn-core-prod

  ► Services
    ✅ pn-core-auth: ACTIVE (Running: 2 / Desired: 2)
    ✅ pn-core-api: ACTIVE (Running: 4 / Desired: 4)

  ► Tasks
    All 6 tasks are healthy.
```

## Troubleshooting

### Problemi Comuni

#### Errore: "AWS credentials not found"

**Causa**: Profilo AWS non configurato o sessione SSO scaduta.

**Soluzione**:

```bash
aws sso login --profile [nome-profilo]
```

---

**Ultima modifica**: 2026-03-24
**Maintainer**: Team GO - Gestione Operativa
