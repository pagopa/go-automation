# Architettura del Monorepo

> Documentazione tecnica della struttura e architettura del monorepo GO Automation.

## Indice

1. [Overview](#overview)
2. [Struttura delle Directory](#struttura-delle-directory)
3. [Descrizione Dettagliata delle Cartelle](#descrizione-dettagliata-delle-cartelle)
4. [Introduzione a pnpm](#introduzione-a-pnpm)
5. [Workspace pnpm](#workspace-pnpm)
6. [Sistema di Build](#sistema-di-build)
7. [Dipendenze tra Package](#dipendenze-tra-package)
8. [TypeScript Configuration](#typescript-configuration)
9. [Convenzioni di Naming](#convenzioni-di-naming)
10. [Struttura Standard degli Script](#struttura-standard-degli-script)
11. [Directory Data Centralizzata](#directory-data-centralizzata)
12. [Deployment Modes](#deployment-modes)

---

## Overview

GO Automation e un **monorepo TypeScript** gestito con **pnpm workspaces**. Contiene:

- **Libreria condivisa**: `@go-automation/go-common` - utilities, framework script, SDK
- **Script di automazione**: organizzati per team/prodotto (GO, SEND, INTEROP)
- **Configurazione centralizzata**: TypeScript, ESLint, build scripts

### Vantaggi del Monorepo

| Vantaggio                    | Descrizione                                                  |
| ---------------------------- | ------------------------------------------------------------ |
| **Codice condiviso**         | La libreria `go-common` e riutilizzabile da tutti gli script |
| **Configurazione unificata** | TypeScript strict mode e ESLint condivisi                    |
| **Build incrementali**       | TypeScript project references per build veloci               |
| **Gestione dipendenze**      | pnpm workspace protocol per dipendenze locali                |
| **Atomic changes**           | Modifiche cross-package in un singolo commit                 |

---

## Struttura delle Directory

```
go-automation/
├── packages/                    # Librerie condivise
│   └── go-common/               # @go-automation/go-common
│       ├── src/
│       │   ├── index.ts         # Entry point
│       │   └── libs/
│       │       ├── core/        # Utilities core (script, logging, config)
│       │       ├── aws/         # AWS credentials management
│       │       └── send/        # SDK per notifiche SEND
│       ├── dist/                # Output compilato
│       ├── package.json
│       └── tsconfig.json
│
├── scripts/                     # Script di automazione
│   ├── go/                      # Script team GO
│   │   └── go-report-alarms/
│   │       ├── src/
│   │       │   ├── main.ts      # Entry point
│   │       │   ├── libs/        # Business logic
│   │       │   └── types/       # Type definitions
│   │       ├── configs/         # File di configurazione
│   │       ├── logs/            # Log files (gitignored)
│   │       ├── package.json
│   │       └── tsconfig.json
│   │
│   ├── send/                    # Script team SEND
│   │   ├── send-monitor-tpp-messages/
│   │   └── send-import-notifications/
│   │
│   └── interop/                 # Script team INTEROP (futuro)
│
├── infra/                       # Infrastruttura condivisa
│   └── docker/                  # File Docker comuni
│       ├── Dockerfile.runtime   # Dockerfile base per tutti gli script
│       └── docker-entrypoint.sh # Entrypoint condiviso
│
├── artifacts/                   # Output di build e deploy (gitignored)
│   └── {script-name}/           # Package standalone per script
│       ├── dist/                # Codice compilato
│       ├── node_modules/        # Solo dipendenze production
│       └── package.json         # Manifest ridotto
│
├── docs/                        # Documentazione
│   ├── ARCHITECTURE.md          # Questo file
│   ├── GOCOMMON.md              # Documentazione go-common
│   ├── GUIDE_LINES.md           # Coding guidelines
│   ├── NEW_SCRIPT.md            # Guida creazione script
│   ├── DEPLOY.md                # Guida al deployment
│   ├── ONBOARDING.md            # Guida per nuovi sviluppatori
│   ├── README-TEMPLATE.md       # Template README per script
│   └── TROUBLESHOOTING.md       # Risoluzione problemi comuni
│
├── bins/                        # Script di utility
│   ├── create-script.sh         # Scaffolding nuovo script
│   ├── build-image.sh           # Build immagine Docker
│   ├── docker-run.sh            # Esecuzione container Docker
│   ├── deploy.sh                # Deploy script standalone
│   └── script-templates/        # Template per scaffolding
│       ├── index.ts.template
│       ├── config.ts.template
│       ├── main.ts.template
│       ├── package.json.template
│       ├── tsconfig.json.template
│       └── README.md.template
│
├── data/                        # Directory centralizzata dati script
│   └── {script-name}/
│       ├── inputs/              # File di input
│       ├── outputs/             # File di output
│       └── configs/             # Configurazioni centralizzate
│
├── tsconfig.base.json           # Configurazione TypeScript base
├── eslint.config.mjs            # Configurazione ESLint
├── pnpm-workspace.yaml          # Definizione workspace
├── pnpm-lock.yaml               # Lockfile dipendenze
├── package.json                 # Root package.json
├── CLAUDE.md                    # Istruzioni per AI
└── README.md                    # Entry point documentazione
```

### Descrizione delle Cartelle

| Directory          | Scopo                                           |
| ------------------ | ----------------------------------------------- |
| `packages/`        | Librerie condivise pubblicate come npm packages |
| `scripts/go/`      | Script per gestione operativa interna           |
| `scripts/send/`    | Script specifici per prodotto SEND              |
| `scripts/interop/` | Script specifici per prodotto INTEROP           |
| `infra/`           | Infrastruttura condivisa (Docker, Terraform)    |
| `artifacts/`       | Output di build/deploy per standalone mode      |
| `docs/`            | Documentazione tecnica e guide                  |
| `bins/`            | Script bash di utility (scaffolding, CI/CD)     |
| `data/`            | Directory centralizzata per input/output script |

---

## Descrizione Dettagliata delle Cartelle

### `infra/` - Infrastruttura Condivisa

La cartella `infra/` contiene file di infrastruttura riutilizzabili da tutti gli script del monorepo.

```
infra/
└── docker/
    ├── Dockerfile.runtime     # Immagine base Alpine con Node.js
    └── docker-entrypoint.sh   # Entrypoint multi-mode (once/cron)
```

| File                   | Descrizione                                                                                                                                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Dockerfile.runtime`   | Dockerfile base per tutti gli script. Usa Alpine Linux, installa Node.js, AWS CLI, e configura un utente non-root (`gouser`). Viene usato da `bins/build-image.sh` per costruire le immagini Docker degli script. |
| `docker-entrypoint.sh` | Script di entrypoint che gestisce le modalità di esecuzione: `once` (esecuzione singola) e `cron` (scheduling con croner). Riceve la modalità dalla variabile `RUN_MODE`.                                         |

**Uso tipico:**

```bash
# Build immagine usando l'infrastruttura condivisa
./bins/build-image.sh send-monitor-tpp-messages latest
```

---

### `artifacts/` - Output di Build e Deploy

La cartella `artifacts/` contiene i package standalone generati dal comando `pnpm deploy`. Ogni script deployato ha la sua sottocartella con tutto il necessario per l'esecuzione isolata.

```
artifacts/
├── .gitkeep
├── go-report-alarms/
│   ├── dist/                  # Codice TypeScript compilato
│   ├── node_modules/          # Solo dipendenze production
│   ├── configs/               # File di configurazione
│   └── package.json           # Manifest con dipendenze
│
└── send-monitor-tpp-messages/
    ├── dist/
    ├── node_modules/
    ├── configs/
    └── package.json
```

| Contenuto       | Descrizione                                          |
| --------------- | ---------------------------------------------------- |
| `dist/`         | Codice JavaScript compilato (output di `tsc`)        |
| `node_modules/` | Solo dipendenze production (no devDependencies)      |
| `configs/`      | File di configurazione copiati dallo script          |
| `package.json`  | Manifest ridotto con solo le informazioni necessarie |

**Caratteristiche:**

- **Gitignored**: La cartella e in `.gitignore` (tranne `.gitkeep`)
- **Generata automaticamente**: Creata da `bins/deploy.sh` o `pnpm deploy`
- **Self-contained**: Ogni sottocartella contiene tutto per l'esecuzione standalone
- **Usata per Docker**: Le immagini Docker copiano da `artifacts/{script}/`

**Generazione:**

```bash
# Deploy singolo script
./bins/deploy.sh go-report-alarms

# Risultato in artifacts/go-report-alarms/
```

---

### `bins/` - Script di Utility

La cartella `bins/` contiene script bash per automazione di operazioni comuni nel monorepo.

```
bins/
├── create-script.sh           # Crea nuovo script con scaffolding
├── build-image.sh             # Build immagine Docker
├── docker-run.sh              # Esecuzione container Docker
├── deploy.sh                  # Deploy script standalone
└── script-templates/          # Template per scaffolding
    ├── index.ts.template      # Entry point
    ├── config.ts.template     # Configurazione
    ├── main.ts.template       # Business logic
    ├── package.json.template  # Manifest npm
    ├── tsconfig.json.template # Config TypeScript
    └── README.md.template     # Documentazione
```

| Script             | Descrizione                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `create-script.sh` | Wizard interattivo per creare un nuovo script. Genera la struttura completa con template, package.json, tsconfig.json e README. |
| `build-image.sh`   | Costruisce l'immagine Docker di uno script. Usa `infra/docker/Dockerfile.runtime` come base.                                    |
| `docker-run.sh`    | Helper per eseguire container Docker degli script. Supporta modalità interattiva e scheduled.                                   |
| `deploy.sh`        | Genera il package standalone in `artifacts/`. Usa `pnpm deploy` per includere solo dipendenze production.                       |

**Uso comune:**

```bash
# Creare nuovo script
./bins/create-script.sh

# Build immagine Docker
./bins/build-image.sh send-monitor-tpp-messages latest

# Eseguire container
./bins/docker-run.sh send-monitor-tpp-messages run
./bins/docker-run.sh send-monitor-tpp-messages up --scheduled

# Deploy standalone
./bins/deploy.sh go-report-alarms
```

---

### `docs/` - Documentazione

La cartella `docs/` contiene tutta la documentazione tecnica del monorepo.

```
docs/
├── ARCHITECTURE.md        # Architettura del monorepo (questo file)
├── GOCOMMON.md            # Documentazione libreria go-common
├── GUIDE_LINES.md         # Coding standards e best practices
├── NEW_SCRIPT.md          # Guida dettagliata creazione script
├── DEPLOY.md              # Guida al deployment (Docker, standalone)
├── ONBOARDING.md          # Guida per nuovi sviluppatori
├── README-TEMPLATE.md     # Template README per nuovi script
└── TROUBLESHOOTING.md     # Risoluzione problemi comuni
```

| Documento            | Destinatari  | Contenuto                                   |
| -------------------- | ------------ | ------------------------------------------- |
| `ARCHITECTURE.md`    | Tutti        | Struttura monorepo, pnpm, TypeScript config |
| `GOCOMMON.md`        | Sviluppatori | API della libreria go-common                |
| `GUIDE_LINES.md`     | Sviluppatori | Convenzioni codice, TypeScript strict       |
| `NEW_SCRIPT.md`      | Sviluppatori | Tutorial creazione nuovo script             |
| `DEPLOY.md`          | DevOps       | Docker, standalone, AWS deployment          |
| `ONBOARDING.md`      | Nuovi membri | Setup ambiente, primi passi                 |
| `README-TEMPLATE.md` | Sviluppatori | Template per README degli script            |
| `TROUBLESHOOTING.md` | Tutti        | Problemi comuni e soluzioni                 |

---

### `data/` - Dati Centralizzati

La cartella `data/` fornisce una struttura centralizzata per input, output e configurazioni degli script.

```
data/
├── go-report-alarms/
│   ├── inputs/            # File CSV/JSON di input
│   ├── outputs/           # Report generati
│   │   └── run_2024-01-15_10-30/
│   │       ├── report.csv
│   │       └── execution.log
│   └── configs/           # Configurazioni centralizzate
│       └── config.json
│
├── send-import-notifications/
│   ├── inputs/
│   │   └── notifications.csv
│   ├── outputs/
│   └── configs/
│
└── go-crea-template/
    └── ...
```

| Sottocartella | Descrizione                                              |
| ------------- | -------------------------------------------------------- |
| `inputs/`     | File di input (CSV, JSON) da processare                  |
| `outputs/`    | Output generati, organizzati per run con timestamp       |
| `configs/`    | Configurazioni centralizzate (priorita su quelle locali) |

**Caratteristiche:**

- **Gitignored**: La cartella e in `.gitignore` per non committare dati
- **Priorita config**: `data/{script}/configs/` ha priorita su `scripts/{team}/{script}/configs/`
- **Persistenza**: I file persistono tra esecuzioni dello script
- **Condivisione**: Piu script possono accedere agli stessi dati

---

## Introduzione a pnpm

### Cos'e pnpm

**pnpm** (Performant NPM) e un package manager per Node.js alternativo a npm e yarn. E stato progettato per essere piu veloce, piu efficiente nello spazio disco e piu rigoroso nella gestione delle dipendenze.

### Come Funziona pnpm

A differenza di npm e yarn, pnpm utilizza un approccio innovativo per la gestione dei pacchetti:

#### Content-Addressable Storage (Global Store)

pnpm mantiene un **global store** unico sul disco (tipicamente in `~/.pnpm-store/`) dove ogni versione di ogni pacchetto viene salvata una sola volta. Quando lo stesso pacchetto e richiesto in piu progetti, pnpm non lo duplica.

```
~/.pnpm-store/
└── v3/
    └── files/
        ├── 00/
        │   └── abc123...   # File di pacchetto (hash-based)
        ├── 01/
        │   └── def456...
        └── ...
```

#### Hard Link e Symlink

Invece di copiare i file dei pacchetti in ogni progetto, pnpm usa:

1. **Hard links**: Collegano i file nel global store alla directory `node_modules/.pnpm/`
2. **Symlinks**: Creano una struttura `node_modules/` che punta ai pacchetti linkati

```
project/
└── node_modules/
    ├── .pnpm/                          # Flat structure con hard links
    │   ├── lodash@4.17.21/
    │   │   └── node_modules/
    │   │       └── lodash/ → hard link al global store
    │   └── express@4.18.2/
    │       └── node_modules/
    │           ├── express/ → hard link al global store
    │           └── body-parser/ → symlink a .pnpm/body-parser@...
    │
    ├── lodash/ → symlink a .pnpm/lodash@4.17.21/node_modules/lodash
    └── express/ → symlink a .pnpm/express@4.18.2/node_modules/express
```

### Vantaggi di pnpm

| Caratteristica             | npm/yarn                                     | pnpm                          |
| -------------------------- | -------------------------------------------- | ----------------------------- |
| **Spazio disco**           | Copia completa per progetto                  | Hard links al global store    |
| **Velocita install**       | Lento (download + copia)                     | Veloce (link se gia presente) |
| **Strict mode**            | Permette accesso a dipendenze non dichiarate | Blocca phantom dependencies   |
| **Struttura node_modules** | Flat (hoisting)                              | Nested + symlinks             |
| **Determinismo**           | Puo variare                                  | Garantito dal lockfile        |

### Confronto Comandi npm vs pnpm

| Operazione              | npm                         | pnpm                            |
| ----------------------- | --------------------------- | ------------------------------- |
| Installa dipendenze     | `npm install`               | `pnpm install`                  |
| Aggiungi pacchetto      | `npm install lodash`        | `pnpm add lodash`               |
| Aggiungi dev dependency | `npm install -D typescript` | `pnpm add -D typescript`        |
| Rimuovi pacchetto       | `npm uninstall lodash`      | `pnpm remove lodash`            |
| Esegui script           | `npm run build`             | `pnpm build` o `pnpm run build` |
| Aggiorna pacchetti      | `npm update`                | `pnpm update`                   |
| Pulisci cache           | `npm cache clean`           | `pnpm store prune`              |

### Comandi pnpm Specifici

```bash
# Mostra dimensione del global store
pnpm store status

# Rimuovi pacchetti non referenziati dal store
pnpm store prune

# Importa da npm/yarn lockfile esistente
pnpm import

# Verifica integrita dei pacchetti
pnpm audit

# Lista dipendenze come albero
pnpm list --depth=2
```

### Perche Usiamo pnpm in questo Monorepo

1. **Efficienza disco**: Con molti script che condividono `go-common` e dipendenze AWS SDK, il risparmio e significativo
2. **Workspace nativi**: Supporto eccellente per monorepo con `workspace:*` protocol
3. **Strict mode**: Previene l'accesso accidentale a dipendenze non dichiarate
4. **Velocita**: Install incrementali molto piu veloci dopo la prima esecuzione
5. **Determinismo**: Il lockfile `pnpm-lock.yaml` garantisce build riproducibili

---

## Workspace pnpm

### Configurazione (pnpm-workspace.yaml)

```yaml
packages:
  - packages/* # Librerie condivise
  - scripts/go/* # Script team GO
  - scripts/send/* # Script team SEND
  - scripts/interop/* # Script team INTEROP
```

### Naming Conventions

| Tipo     | Pattern                 | Esempio                                         |
| -------- | ----------------------- | ----------------------------------------------- |
| Packages | `@go-automation/{name}` | `@go-automation/go-common`                      |
| Scripts  | `{team}-{name}`         | `go-report-alarms`, `send-import-notifications` |

### Comandi Workspace

```bash
# Esegui comando in tutti i package
pnpm -r build

# Esegui in package specifico
pnpm --filter=go-report-alarms build

# Esegui in package e sue dipendenze
pnpm --filter=go-report-alarms... build

# Esegui solo nei package @go-automation
pnpm -r --filter='@go-automation/*' build

# Esegui in tutti gli script
pnpm -r --filter='./scripts/**' build
```

### Dipendenze Workspace

Per aggiungere `go-common` come dipendenza di uno script:

```bash
# Dalla directory dello script
pnpm add @go-automation/go-common@workspace:*
```

Questo crea una dipendenza locale che viene risolta dal workspace, non da npm registry.

```json
// package.json dello script
{
  "dependencies": {
    "@go-automation/go-common": "workspace:*"
  }
}
```

---

## Sistema di Build

### Build Pipeline

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   TypeScript    │────▶│    go-common    │────▶│     Scripts     │
│   Compilation   │     │   (build first) │     │   (depend on    │
│                 │     │                 │     │    go-common)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Ordine di Build

1. **go-common** - Deve essere compilato per primo (altre dipendenze lo referenziano)
2. **Scripts** - Possono essere compilati in parallelo dopo go-common

### Comandi di Build

```bash
# Build completo (rispetta l'ordine)
pnpm build

# Solo go-common
pnpm build:common

# Solo gli script
pnpm build:scripts

# Script specifico
pnpm --filter=go-report-alarms build
```

### Script nel Root package.json

```json
{
  "scripts": {
    "build": "pnpm -r run build",
    "build:common": "pnpm --filter=@go-automation/go-common build",
    "build:scripts": "pnpm -r --filter='./scripts/**' build",
    "clean": "pnpm -r run clean",
    "clean:all": "pnpm -r run clean && rm -rf node_modules"
  }
}
```

---

## Dipendenze tra Package

### Grafico delle Dipendenze

```
┌───────────────────────────────────────────────────────────────┐
│                         scripts/                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │go-report-    │  │send-monitor- │  │send-import-          │ │
│  │alarms        │  │tpp-messages  │  │notifications         │ │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘ │
│         │                 │                      │             │
│         ▼                 ▼                      ▼             │
│  ┌────────────────────────────────────────────────────────────┤
│  │              @go-automation/go-common                       │
│  │                                                             │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────┐   │
│  │  │  Core   │  │   AWS   │  │  SEND   │  │   Network   │   │
│  │  │         │  │         │  │   SDK   │  │             │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────────┘   │
│  └────────────────────────────────────────────────────────────┤
└───────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │      External Dependencies     │
              │  (AWS SDK, prompts, yaml, etc) │
              └───────────────────────────────┘
```

### Dipendenze Esterne Principali

| Package             | Uso                        |
| ------------------- | -------------------------- |
| `@aws-sdk/client-*` | AWS SDK v3 per servizi AWS |
| `prompts`           | Prompt interattivi CLI     |
| `ora`               | Spinner per CLI            |
| `yaml`              | Parsing file YAML          |
| `csv-parse`         | Parsing file CSV           |
| `chalk`             | Colori per output console  |

---

## TypeScript Configuration

### Configurazione Base (tsconfig.base.json)

```json
{
  "compilerOptions": {
    // Strict Type Checking
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noUncheckedIndexedAccess": true,

    // Module System
    "module": "ESNext",
    "moduleResolution": "node",
    "esModuleInterop": true,

    // Output
    "target": "ES2024",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,

    // Project References
    "composite": true,
    "incremental": true
  }
}
```

### Configurazione Package (tsconfig.json in ogni package)

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true,
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"],
  "references": [{ "path": "../../../packages/go-common" }]
}
```

### Project References

I project references abilitano:

1. **Build incrementali** - Solo i file modificati vengono ricompilati
2. **Dipendenze esplicite** - Il compilatore conosce l'ordine di build
3. **Watch mode efficiente** - Rebuild automatico quando cambiano le dipendenze

---

## Convenzioni di Naming

### Directory e File

| Tipo             | Convenzione           | Esempio                           |
| ---------------- | --------------------- | --------------------------------- |
| Directory script | kebab-case            | `go-report-alarms/`               |
| File TypeScript  | PascalCase per classi | `GOScript.ts`, `ConfigManager.ts` |
| File types       | PascalCase            | `AlarmData.ts`, `Config.ts`       |
| File index       | lowercase             | `index.ts`                        |
| File config      | lowercase             | `config.json`, `config.yaml`      |

### Nomenclatura Script

Pattern: `{prodotto}-{verbo}-{descrizione}`

| Prodotto     | Prefisso   | Esempi                                          |
| ------------ | ---------- | ----------------------------------------------- |
| GO (interno) | `go-`      | `go-report-alarms`, `go-manage-lambda`          |
| SEND         | `send-`    | `send-import-notifications`, `send-monitor-tpp` |
| INTEROP      | `interop-` | `interop-sync-catalog`                          |

### Verbi Standard

#### Operazioni CRUD e Dati

| Verbo    | Uso                                | Esempio                             |
| -------- | ---------------------------------- | ----------------------------------- |
| `get`    | Recupero singolo elemento          | `go-get-alarm-details`              |
| `set`    | Impostazione valore                | `go-set-alarm-threshold`            |
| `fetch`  | Recupero dati (da API/remote)      | `interop-fetch-catalog-data`        |
| `load`   | Caricamento dati (da file/storage) | `go-load-configuration`             |
| `save`   | Salvataggio dati                   | `send-save-notification-batch`      |
| `store`  | Memorizzazione persistente         | `go-store-audit-logs`               |
| `create` | Creazione nuova risorsa            | `send-create-notification-template` |
| `delete` | Eliminazione risorsa               | `go-delete-expired-logs`            |
| `remove` | Rimozione elemento                 | `send-remove-failed-messages`       |
| `update` | Aggiornamento record               | `send-update-notification-metadata` |
| `add`    | Aggiunta elemento a collezione     | `go-add-alarm-rule`                 |
| `import` | Importazione dati                  | `send-import-notifications`         |
| `export` | Esportazione dati                  | `send-export-metrics-csv`           |

#### Trasformazione e Validazione

| Verbo       | Uso                            | Esempio                              |
| ----------- | ------------------------------ | ------------------------------------ |
| `parse`     | Parsing di dati strutturati    | `go-parse-cloudwatch-logs`           |
| `format`    | Formattazione output           | `send-format-notification-report`    |
| `transform` | Trasformazione dati            | `interop-transform-catalog-schema`   |
| `convert`   | Conversione formato            | `go-convert-csv-to-json`             |
| `validate`  | Validazione dati/input         | `send-validate-notification-payload` |
| `verify`    | Verifica integrita/correttezza | `go-verify-backup-integrity`         |
| `check`     | Verifiche di stato             | `go-check-backup-status`             |
| `ensure`    | Garanzia precondizioni         | `go-ensure-lambda-permissions`       |

#### Monitoraggio e Analisi

| Verbo     | Uso                      | Esempio                          |
| --------- | ------------------------ | -------------------------------- |
| `monitor` | Monitoraggio continuo    | `send-monitor-tpp-messages`      |
| `analyze` | Analisi dati/logs        | `send-analyze-delivery-failures` |
| `report`  | Generazione report       | `go-report-alarms`               |
| `audit`   | Controllo conformita     | `go-audit-iam-policies`          |
| `trace`   | Tracciamento richieste   | `send-trace-notification-flow`   |
| `profile` | Profilazione performance | `go-profile-lambda-executions`   |

#### Lifecycle e Controllo

| Verbo      | Uso                       | Esempio                          |
| ---------- | ------------------------- | -------------------------------- |
| `start`    | Avvio processo/servizio   | `go-start-batch-processor`       |
| `stop`     | Arresto processo/servizio | `go-stop-scheduled-task`         |
| `init`     | Inizializzazione          | `go-init-environment`            |
| `shutdown` | Spegnimento graceful      | `go-shutdown-workers`            |
| `restart`  | Riavvio                   | `go-restart-ecs-service`         |
| `pause`    | Sospensione temporanea    | `send-pause-notification-queue`  |
| `resume`   | Ripresa esecuzione        | `send-resume-notification-queue` |

#### Comunicazione e Messaggistica

| Verbo         | Uso                         | Esempio                            |
| ------------- | --------------------------- | ---------------------------------- |
| `send`        | Invio messaggio/notifica    | `send-send-bulk-notifications`     |
| `receive`     | Ricezione messaggi          | `go-receive-sqs-messages`          |
| `emit`        | Emissione eventi            | `go-emit-cloudwatch-events`        |
| `handle`      | Gestione eventi/richieste   | `send-handle-delivery-callback`    |
| `notify`      | Notifica utenti/sistemi     | `go-notify-on-alarm`               |
| `broadcast`   | Invio a tutti i destinatari | `send-broadcast-announcement`      |
| `publish`     | Pubblicazione su topic      | `go-publish-sns-message`           |
| `subscribe`   | Iscrizione a eventi         | `go-subscribe-alarm-notifications` |
| `unsubscribe` | Disiscrizione da eventi     | `go-unsubscribe-deprecated-alarms` |

#### Build e Generazione

| Verbo      | Uso                      | Esempio                          |
| ---------- | ------------------------ | -------------------------------- |
| `build`    | Compilazione/costruzione | `go-build-deployment-package`    |
| `compile`  | Compilazione codice      | `go-compile-templates`           |
| `generate` | Generazione automatica   | `go-generate-daily-report`       |
| `render`   | Rendering template       | `send-render-notification-email` |
| `assemble` | Assemblaggio componenti  | `go-assemble-infrastructure`     |

#### Ricerca e Filtraggio

| Verbo    | Uso                    | Esempio                         |
| -------- | ---------------------- | ------------------------------- |
| `find`   | Ricerca elementi       | `go-find-orphan-resources`      |
| `search` | Ricerca full-text      | `send-search-notification-logs` |
| `filter` | Filtraggio per criteri | `go-filter-alarms-by-severity`  |
| `sort`   | Ordinamento dati       | `go-sort-metrics-by-value`      |
| `list`   | Elenco elementi        | `go-list-active-alarms`         |
| `query`  | Query complessa        | `send-query-delivery-stats`     |

#### File e I/O

| Verbo     | Uso                   | Esempio                      |
| --------- | --------------------- | ---------------------------- |
| `open`    | Apertura risorsa      | `go-open-log-stream`         |
| `close`   | Chiusura risorsa      | `go-close-db-connections`    |
| `read`    | Lettura dati          | `go-read-configuration-file` |
| `write`   | Scrittura dati        | `go-write-execution-log`     |
| `copy`    | Copia file/dati       | `go-copy-logs-to-s3`         |
| `move`    | Spostamento file/dati | `go-move-processed-files`    |
| `archive` | Archiviazione         | `go-archive-old-logs`        |
| `backup`  | Backup dati           | `go-backup-dynamodb-table`   |
| `restore` | Ripristino dati       | `go-restore-backup`          |

#### Stato e Toggle

| Verbo        | Uso                     | Esempio                              |
| ------------ | ----------------------- | ------------------------------------ |
| `enable`     | Abilitazione feature    | `go-enable-alarm`                    |
| `disable`    | Disabilitazione feature | `go-disable-maintenance-alarm`       |
| `toggle`     | Cambio stato on/off     | `go-toggle-feature-flag`             |
| `activate`   | Attivazione risorsa     | `send-activate-notification-channel` |
| `deactivate` | Disattivazione risorsa  | `send-deactivate-old-template`       |
| `lock`       | Blocco risorsa          | `go-lock-deployment`                 |
| `unlock`     | Sblocco risorsa         | `go-unlock-deployment`               |

#### UI e Visualizzazione

| Verbo     | Uso                  | Esempio                        |
| --------- | -------------------- | ------------------------------ |
| `show`    | Visualizzazione dati | `go-show-alarm-summary`        |
| `hide`    | Nascondere elementi  | `go-hide-resolved-alarms`      |
| `display` | Presentazione output | `go-display-metrics-dashboard` |
| `print`   | Stampa su console    | `go-print-execution-summary`   |

#### Connessione e Registrazione

| Verbo        | Uso                     | Esempio                       |
| ------------ | ----------------------- | ----------------------------- |
| `connect`    | Connessione a servizio  | `go-connect-database`         |
| `disconnect` | Disconnessione          | `go-disconnect-idle-sessions` |
| `register`   | Registrazione risorsa   | `send-register-webhook`       |
| `unregister` | Deregistrazione risorsa | `send-unregister-webhook`     |
| `bind`       | Collegamento risorse    | `go-bind-alarm-to-topic`      |
| `unbind`     | Scollegamento risorse   | `go-unbind-alarm-from-topic`  |

#### Sincronizzazione e Gestione

| Verbo         | Uso                       | Esempio                        |
| ------------- | ------------------------- | ------------------------------ |
| `sync`        | Sincronizzazione dati     | `interop-sync-catalog`         |
| `manage`      | Gestione multi-operazione | `go-manage-lambda-concurrency` |
| `orchestrate` | Orchestrazione workflow   | `go-orchestrate-deployment`    |
| `schedule`    | Pianificazione task       | `go-schedule-maintenance`      |
| `cleanup`     | Pulizia risorse           | `go-cleanup-temp-files`        |
| `migrate`     | Migrazione dati/schema    | `go-migrate-dynamodb-schema`   |
| `deploy`      | Deployment risorse        | `go-deploy-lambda-function`    |
| `rollback`    | Rollback modifiche        | `go-rollback-deployment`       |

---

## Struttura Standard degli Script

Ogni script nel monorepo segue una **struttura a 3 file** per separare le responsabilita in modo chiaro e mantenibile.

### Struttura Directory

```
script/
├── src/
│   ├── index.ts       # Entry point minimale
│   ├── config.ts      # Metadata, parameters, interface config
│   ├── main.ts        # Business logic
│   ├── libs/          # Helper functions e servizi (opzionale)
│   └── types/         # Type definitions (opzionale)
├── configs/           # File di configurazione
├── logs/              # Log files (gitignored)
├── package.json
└── tsconfig.json
```

### Descrizione dei File

#### 1. `index.ts` - Entry Point Minimale

Il file `index.ts` ha il solo compito di wiring:

- Importa metadata e parameters da `config.ts`
- Importa la funzione `main()` da `main.ts`
- Crea l'istanza `GOScript`
- Chiama `script.run()` passando la funzione main

```typescript
/**
 * Script Name - Entry Point
 *
 * Minimal entry point that wires together:
 * - GOScript instantiation with metadata and parameters
 * - Configuration loading and validation
 * - Main business logic execution
 */

import { Core } from '@go-automation/go-common';

import { scriptMetadata, scriptParameters } from './config.js';
import { main } from './main.js';

/**
 * Create the GOScript instance with metadata and parameters from config
 */
const script = new Core.GOScript({
  metadata: scriptMetadata,
  config: {
    parameters: scriptParameters,
  },
});

/**
 * Run the script with lifecycle management
 */
script
  .run(async () => {
    await main(script);
  })
  .catch(() => {
    process.exit(1);
  });
```

#### 2. `config.ts` - Configurazione

Il file `config.ts` centralizza tutta la configurazione dello script:

- **`scriptMetadata`**: nome, versione, descrizione, autori
- **`scriptParameters`**: definizione parametri CLI con tipi, descrizioni, alias
- **Interface di configurazione tipizzata**: interfaccia TypeScript per la config
- **Funzione `configure()` (opzionale)**: logica di configurazione custom

```typescript
/**
 * Script Name - Configuration Module
 *
 * Contains script metadata, parameters definition, and configuration interface.
 */

import { Core } from '@go-automation/go-common';

/**
 * Script metadata
 */
export const scriptMetadata: Core.GOScriptMetadata = {
  name: 'My Script',
  version: '1.0.0',
  description: 'Descrizione dello script',
  authors: ['Team GO - Gestione Operativa'],
};

/**
 * Script parameter definitions
 */
export const scriptParameters: ReadonlyArray<Core.GOConfigParameterOptions> = [
  {
    name: 'input.file',
    type: Core.GOConfigParameterType.STRING,
    description: 'Path del file di input',
    required: true,
    aliases: ['i'],
  },
  {
    name: 'verbose',
    type: Core.GOConfigParameterType.BOOL,
    description: 'Enable verbose output',
    required: false,
    aliases: ['v'],
    defaultValue: false,
  },
  {
    name: 'aws.profile',
    type: Core.GOConfigParameterType.STRING,
    description: 'AWS SSO profile name',
    required: true,
    aliases: ['ap'],
  },
] as const;

/**
 * Script configuration interface
 */
export interface MyScriptConfig {
  readonly inputFile: string;
  readonly verbose: boolean;
  readonly awsProfile: string;
}
```

#### 3. `main.ts` - Business Logic

Il file `main.ts` contiene tutta la logica di business:

- Esporta una funzione `async main(script: Core.GOScript): Promise<void>`
- Usa `await script.getConfiguration<T>()` per ottenere la config tipizzata
- Contiene la logica di elaborazione, chiamate a servizi, output

```typescript
/**
 * Script Name - Main Logic Module
 *
 * Contains the core business logic.
 */

import { Core } from '@go-automation/go-common';

import type { MyScriptConfig } from './config.js';
import { MyService } from './libs/MyService.js';

/**
 * Main script execution function
 *
 * @param script - The GOScript instance for logging and prompts
 */
export async function main(script: Core.GOScript): Promise<void> {
  // Ottieni configurazione tipizzata (ASYNC - usa await!)
  const config = await script.getConfiguration<MyScriptConfig>();

  // Inizializza servizi
  const service = new MyService(config);

  try {
    script.logger.section('Elaborazione');
    script.prompt.startSpinner('Elaborazione in corso...');

    const result = await service.process();

    script.prompt.spinnerStop('Elaborazione completata');

    // Mostra risultati
    script.logger.section('Risultati');
    script.logger.info(`Processati: ${result.count} elementi`);
  } finally {
    // Cleanup risorse
    await service.close();
  }
}
```

### Vantaggi della Struttura a 3 File

| Vantaggio                            | Descrizione                                            |
| ------------------------------------ | ------------------------------------------------------ |
| **Separazione delle responsabilita** | Ogni file ha un ruolo specifico e ben definito         |
| **Testabilita**                      | `main.ts` puo essere testato indipendentemente         |
| **Riutilizzo**                       | La configurazione puo essere importata da altri moduli |
| **Manutenibilita**                   | Modifiche isolate in file specifici                    |
| **Leggibilita**                      | Entry point minimale, logica concentrata in `main.ts`  |

### Note Importanti

1. **`getConfiguration<T>()` e ora async**: Usa sempre `await` quando ottieni la configurazione
2. **Signal handlers automatici**: GOScript gestisce automaticamente SIGTERM, SIGINT, SIGQUIT
3. **Cleanup automatico**: Il metodo `cleanup()` viene chiamato automaticamente durante lo shutdown

---

## Directory Data Centralizzata

La directory `data/` nella root del monorepo fornisce una struttura centralizzata per i file di script.

### Struttura

```
data/
└── {script-name}/
    ├── inputs/     # File di input (CSV, JSON)
    ├── outputs/    # Output generati
    │   └── {script}_{timestamp}/
    │       ├── report.csv
    │       └── execution.log
    └── configs/    # Configurazioni centralizzate
        ├── config.json
        └── config.yaml
```

### Priorita Config Files

Il sistema cerca i file di configurazione in questo ordine:

1. **Centralizzata**: `data/{script-name}/configs/config.json`
2. **Locale**: `scripts/{team}/{script}/configs/config.json`

### Vantaggi

- **Separazione dati/codice**: I dati non sono nel repository
- **Persistenza**: Output e log persistono tra esecuzioni
- **Condivisione**: File di input condivisibili tra script
- **Gitignore**: La directory `data/` e gitignored

---

## Deployment Modes

Gli script supportano due modalità di deployment: **monorepo** (default) e **standalone**.

### GODeploymentMode

| Modalità     | Descrizione                   | Uso                      |
| ------------ | ----------------------------- | ------------------------ |
| `MONOREPO`   | Esecuzione dentro il monorepo | Sviluppo, CI/CD monorepo |
| `STANDALONE` | Deployment isolato            | Docker, Lambda, EC2      |

### Rilevamento Automatico

Il sistema rileva automaticamente la modalità cercando marker del monorepo:

```
1. GO_DEPLOYMENT_MODE env → usa valore esplicito se presente
   ↓
2. Cerca pnpm-workspace.yaml salendo dalla cwd
   → Trovato → MONOREPO
   ↓
3. Cerca package.json con "workspaces" o name="go-automation"
   → Trovato → MONOREPO
   ↓
4. Default → STANDALONE
```

### Variabili d'Ambiente

| Variabile            | Descrizione                 | Esempio                   |
| -------------------- | --------------------------- | ------------------------- |
| `GO_DEPLOYMENT_MODE` | Forza modalità deployment   | `monorepo` o `standalone` |
| `GO_BASE_DIR`        | Base directory (standalone) | `/app`                    |
| `GO_DATA_DIR`        | Override data directory     | `/app/data`               |
| `GO_CONFIG_DIR`      | Override config directory   | `/app/configs`            |
| `GO_INPUT_DIR`       | Override input directory    | `/app/data/inputs`        |
| `GO_OUTPUT_DIR`      | Override output directory   | `/app/data/outputs`       |

### Struttura Directory per Mode

**Monorepo Mode:**

```
go-automation/                    # Monorepo root (rilevato automaticamente)
├── data/
│   └── {script-name}/           # Directory per-script
│       ├── configs/             # Config centralizzati
│       ├── inputs/              # File di input
│       └── outputs/             # Output con timestamp
├── scripts/
│   └── go/
│       └── {script-name}/
│           ├── src/
│           └── configs/         # Config locali (fallback)
```

**Standalone Mode:**

```
/app/                            # Base dir (GO_BASE_DIR o cwd)
├── configs/                     # GO_CONFIG_DIR
│   └── config.json
├── data/                        # GO_DATA_DIR
│   ├── inputs/                  # GO_INPUT_DIR
│   └── outputs/                 # GO_OUTPUT_DIR
│       └── {script}_{timestamp}/
└── dist/
    └── main.js
```

### Uso Programmatico

```typescript
import { Core } from '@go-automation/go-common';

// Via GOPaths
const paths = new Core.GOPaths('my-script');
console.log('Mode:', paths.getDeploymentMode());
console.log('Is standalone:', paths.isStandalone());
console.log('Base dir:', paths.getBaseDir());

// Via GOExecutionEnvironment
console.log('Mode:', Core.GOExecutionEnvironment.detect().deploymentMode);
console.log('Is monorepo:', Core.GOExecutionEnvironment.isMonorepo());
```

### Deployment Standalone

Per deployare uno script in standalone mode:

```bash
# 1. Build lo script
pnpm --filter=my-script build

# 2. Crea package standalone
mkdir deploy && cd deploy
cp -r ../scripts/go/my-script/dist .
cp -r ../scripts/go/my-script/configs .
cp ../scripts/go/my-script/package.json .

# 3. Installa dipendenze production
npm install --production

# 4. Esegui con variabili d'ambiente
GO_DEPLOYMENT_MODE=standalone \
GO_BASE_DIR=/app \
node dist/main.js
```

---

## Riferimenti

- [pnpm Workspaces](https://pnpm.io/workspaces)
- [TypeScript Project References](https://www.typescriptlang.org/docs/handbook/project-references.html)
- [go-common Documentation](GOCOMMON.md)
- [Coding Guidelines](GUIDE_LINES.md)

---

**Ultima modifica**: 2026-01-23
**Maintainer**: Team GO - Gestione Operativa
