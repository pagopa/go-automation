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

GO Automation è un **monorepo TypeScript** gestito con **pnpm workspaces**. Oggi il repository è organizzato in quattro layer principali:

- **Libreria condivisa**: `@go-automation/go-common` - framework script, utilities core, adapter AWS/SEND, import/export, JSON utilities, messaging e runbook
- **Script CLI**: package eseguibili organizzati per team/prodotto (GO, SEND, INTEROP)
- **Functions serverless**: package in `functions/*` che riusano la business logic degli script tramite `GOScript.createLambdaHandler()`
- **Toolchain centralizzata**: TypeScript strict, ESLint flat config, scaffold validation, CI riutilizzabile, coverage e security audit

### Vantaggi del Monorepo

| Vantaggio                       | Descrizione                                                                |
| ------------------------------- | -------------------------------------------------------------------------- |
| **Codice condiviso**            | `go-common` viene riusata da script CLI, tooling e function Lambda         |
| **Configurazione unificata**    | TypeScript strict mode, ESLint flat config e template condivisi            |
| **Build incrementali**          | TypeScript project references e workspace filter per build mirati          |
| **Riuso CLI/Lambda**            | La stessa `main()` può essere eseguita da CLI e da adapter serverless      |
| **Quality gates centralizzati** | Scaffold validator, coverage e security audit sono definiti una volta sola |
| **Atomic changes**              | Modifiche cross-package in un singolo commit                               |

### Novità Recenti (Marzo-Aprile 2026)

- **`functions/*` è diventato un workspace di primo livello**: le Lambda non sono più trattate come artefatti esterni, ma come package first-class con `package.json`, `tsconfig.json` e build dedicata
- **Nuovo pattern CLI → Lambda adapter**: `handler.ts` importa `scriptMetadata`, `scriptParameters` e `main()` dallo script esistente e li espone via `GOScript.createLambdaHandler()`
- **Scaffold standard più rigoroso**: i tipi di configurazione vivono in `src/types/`, `config.ts` contiene solo metadata e parameters, `main.ts` deve restare focalizzato sulla sola `main()`
- **Quality pipeline più forte**: CI riutilizzabile, validazione scaffold, soglie di coverage e workflow separato di security audit
- **`go-common` ampliata**: nuovi moduli JSON import/export, messaging con adapter Slack, helper ECS/S3 e miglioramenti a `GOPaths` per ambienti AWS-managed

---

## Struttura delle Directory

```text
go-automation/
├── packages/
│   └── go-common/
│       ├── src/libs/
│       │   ├── aws/             # Client provider, S3, SQS, ECS, credenziali
│       │   ├── core/
│       │   │   ├── config/      # Reader, provider, parser, validation
│       │   │   ├── exporters/   # CSV, JSON, HTML, binary, file
│       │   │   ├── importers/   # CSV, JSON, file
│       │   │   ├── json/        # Detector, extractor e field-path helpers
│       │   │   ├── messaging/   # GOMessenger e adapter Slack
│       │   │   ├── prompt/      # Spinner, progress e prompt UI
│       │   │   └── script/      # GOScript, lifecycle e Lambda handler
│       │   ├── runbook/         # Engine, step, servizi e tracing
│       │   └── send/            # Builder, servizi e worker SEND
│       ├── package.json
│       └── tsconfig.json
│
├── scripts/
│   ├── aws/                     # CloudFormation e config AWS collegate agli script
│   ├── go/
│   │   ├── go-analyze-alarm/
│   │   ├── go-parse-json/
│   │   └── go-report-alarms/
│   ├── send/
│   │   ├── send-check-ecs/
│   │   ├── send-download-safestorage-attachments/
│   │   ├── send-dump-sqs/
│   │   ├── send-fetch-timeline-from-iun/
│   │   ├── send-import-notifications/
│   │   ├── send-monitor-tpp-messages/
│   │   ├── send-query-dynamodb/
│   │   └── send-report-dlq/
│   └── interop/
│
├── functions/
│   └── go-SendMonitorTppMessagesLambda/
│       ├── src/handler.ts       # Adapter Lambda che riusa uno script CLI
│       ├── src/test-local.ts    # Invocazione locale
│       ├── esbuild.config.mjs   # Bundling esbuild verso artifacts/
│       ├── package.json
│       └── tsconfig.json
│
├── infra/
│   └── docker/
│       ├── Dockerfile.runtime
│       └── docker-entrypoint.sh
│
├── artifacts/                   # Output di deploy standalone e bundle Lambda
│   ├── {script-name}/
│   │   ├── dist/
│   │   ├── node_modules/
│   │   └── configs/
│   └── go-SendMonitorTppMessagesLambda/
│       ├── handler.mjs
│       ├── handler.mjs.map
│       └── configs/
│
├── bins/
│   ├── create-script.sh
│   ├── build-image.sh
│   ├── deploy.sh
│   ├── docker-run.sh
│   ├── validate-scaffold/
│   └── script-templates/
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── GOCOMMON.md
│   ├── SCRIPTS.md
│   ├── DEPLOY.md
│   └── ...
│
├── data/
│   └── {script-name}/
│       ├── inputs/
│       ├── outputs/
│       └── configs/
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── ci-job.yml
│       └── security.yml
│
├── tsconfig.base.json
├── eslint.config.mjs
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── package.json
└── README.md
```

### Descrizione delle Cartelle

| Directory            | Scopo                                                       |
| -------------------- | ----------------------------------------------------------- |
| `packages/`          | Librerie condivise pubblicate come workspace packages       |
| `scripts/go/`        | Script per gestione operativa interna                       |
| `scripts/send/`      | Script specifici per prodotto SEND                          |
| `scripts/interop/`   | Script specifici per prodotto INTEROP                       |
| `functions/`         | Adapter Lambda che riusano script esistenti                 |
| `infra/`             | Infrastruttura condivisa (Docker e asset runtime)           |
| `artifacts/`         | Output di deploy standalone e bundle Lambda                 |
| `docs/`              | Documentazione tecnica e guide                              |
| `bins/`              | Tooling di scaffolding, deploy e validazione                |
| `data/`              | Directory centralizzata per input/output/config script      |
| `.github/workflows/` | Pipeline CI, coverage, scaffold validation e security audit |

---

## Descrizione Dettagliata delle Cartelle

### `functions/` - Adapter Serverless

La cartella `functions/` contiene package workspace dedicati agli entry point serverless. Ogni function vive come progetto indipendente, ma **non duplica la business logic**: importa `scriptMetadata`, `scriptParameters` e `main()` da uno script CLI esistente e li espone tramite `GOScript.createLambdaHandler()`.

```
functions/
└── go-SendMonitorTppMessagesLambda/
    ├── src/
    │   ├── handler.ts         # Adapter Lambda che delega a main(script)
    │   └── test-local.ts      # Esecuzione locale della function
    ├── esbuild.config.mjs     # Bundling ESM single-file verso artifacts/
    ├── package.json           # Workspace package con dipendenze su script + go-common
    └── tsconfig.json
```

| File                 | Descrizione                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| `src/handler.ts`     | Wrapper Lambda che riusa la stessa `main()` dello script CLI e supporta config da env/evento      |
| `src/test-local.ts`  | Harness locale per provare la function senza deploy AWS                                           |
| `esbuild.config.mjs` | Produce un bundle ESM in `artifacts/`, esclude `@aws-sdk/*` e copia i `configs/` necessari        |
| `package.json`       | Definisce script `build`, `package`, `test:local` e le dipendenze workspace sullo script sorgente |
| `tsconfig.json`      | Referenzia sia `go-common` sia lo script riusato                                                  |

**Pattern architetturale:**

- **CLI e Lambda condividono la stessa business logic**: cambia solo l'entry point
- **Le function sono package first-class** nel workspace pnpm
- **Il packaging Lambda è separato dal deploy standalone**: usa `esbuild`, non `pnpm deploy`
- **I percorsi runtime usano `GOPaths`** per adattarsi anche ad ambienti AWS-managed con directory scrivibili come `/tmp`

---

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

La cartella `artifacts/` contiene sia i package standalone generati da `pnpm deploy`, sia i bundle Lambda prodotti da `esbuild`. È quindi il punto di convergenza dei due principali target di packaging del monorepo.

```
artifacts/
├── .gitkeep
├── go-report-alarms/
│   ├── dist/                  # Codice TypeScript compilato
│   ├── node_modules/          # Solo dipendenze production
│   ├── configs/               # File di configurazione
│   └── package.json           # Manifest con dipendenze
│
└── go-SendMonitorTppMessagesLambda/
    ├── handler.mjs            # Bundle ESM singolo file
    ├── handler.mjs.map        # Sourcemap per debug
    ├── configs/
    └── ...
```

| Contenuto       | Descrizione                                          |
| --------------- | ---------------------------------------------------- |
| `dist/`         | Codice JavaScript compilato (output di `tsc`)        |
| `node_modules/` | Solo dipendenze production (no devDependencies)      |
| `configs/`      | File di configurazione copiati dallo script          |
| `package.json`  | Manifest ridotto con solo le informazioni necessarie |
| `handler.mjs`   | Bundle Lambda prodotto da `esbuild`                  |

**Caratteristiche:**

- **Gitignored**: La cartella è in `.gitignore` (tranne `.gitkeep`)
- **Generata automaticamente**: viene popolata da `bins/deploy.sh`, `pnpm deploy` o `node esbuild.config.mjs`
- **Supporta due strategie di packaging**: standalone con `dist/ + node_modules`, oppure Lambda con bundle ESM
- **Usata da Docker e Lambda**: Docker copia gli artifact standalone, la Lambda usa il bundle sotto `artifacts/{function}/`

**Generazione:**

```bash
# Deploy standalone di uno script
./bins/deploy.sh go-report-alarms

# Bundle Lambda
pnpm --filter=go-send-monitor-tpp-messages-lambda build
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
├── validate-scaffold/         # Validatore della struttura script
└── script-templates/          # Template per scaffolding
    ├── index.ts.template      # Entry point
    ├── config.ts.template     # Configurazione
    ├── config-type.ts.template # Tipo config in src/types/
    ├── main.ts.template       # Business logic
    ├── package.json.template  # Manifest npm
    ├── tsconfig.json.template # Config TypeScript
    └── README.md.template     # Documentazione
```

| Script              | Descrizione                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `create-script.sh`  | Wizard interattivo per creare un nuovo script. Genera la struttura completa con template, package.json, tsconfig.json e README. |
| `build-image.sh`    | Costruisce l'immagine Docker di uno script. Usa `infra/docker/Dockerfile.runtime` come base.                                    |
| `docker-run.sh`     | Helper per eseguire container Docker degli script. Supporta modalità interattiva e scheduled.                                   |
| `deploy.sh`         | Genera il package standalone in `artifacts/`. Usa `pnpm deploy` per includere solo dipendenze production.                       |
| `validate-scaffold` | Tool TypeScript che verifica che ogni script rispetti struttura, wiring, package.json e tsconfig attesi                         |

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

# Validazione strutturale di tutti gli script
pnpm validate:scaffold
```

---

### `docs/` - Documentazione

La cartella `docs/` contiene tutta la documentazione tecnica del monorepo.

```
docs/
├── ARCHITECTURE.md        # Architettura del monorepo (questo file)
├── GOCOMMON.md            # Documentazione libreria go-common
├── GUIDE_LINES.md         # Coding standards e best practices
├── SCRIPTS.md             # Guida completa script
├── DEPLOY.md              # Guida al deployment (Docker, standalone)
├── ONBOARDING.md          # Guida per nuovi sviluppatori
├── README-TEMPLATE.md     # Template README per nuovi script
└── TROUBLESHOOTING.md     # Risoluzione problemi comuni
```

| Documento            | Destinatari  | Contenuto                                           |
| -------------------- | ------------ | --------------------------------------------------- |
| `ARCHITECTURE.md`    | Tutti        | Struttura monorepo, pnpm, TypeScript config         |
| `GOCOMMON.md`        | Sviluppatori | API della libreria go-common                        |
| `GUIDE_LINES.md`     | Sviluppatori | Convenzioni codice, TypeScript strict               |
| `SCRIPTS.md`         | Sviluppatori | Architettura, convenzioni, quality gates, toolchain |
| `DEPLOY.md`          | DevOps       | Docker, standalone, AWS deployment                  |
| `ONBOARDING.md`      | Nuovi membri | Setup ambiente, primi passi                         |
| `README-TEMPLATE.md` | Sviluppatori | Template per README degli script                    |
| `TROUBLESHOOTING.md` | Tutti        | Problemi comuni e soluzioni                         |

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
- **Condivisione**: Più script possono accedere agli stessi dati

---

## Introduzione a pnpm

### Cos'e pnpm

**pnpm** (Performant NPM) è un package manager per Node.js alternativo a npm e yarn. È stato progettato per essere più veloce, più efficiente nello spazio disco è più rigoroso nella gestione delle dipendenze.

### Come Funziona pnpm

A differenza di npm e yarn, pnpm utilizza un approccio innovativo per la gestione dei pacchetti:

#### Content-Addressable Storage (Global Store)

pnpm mantiene un **global store** unico sul disco (tipicamente in `~/.pnpm-store/`) dove ogni versione di ogni pacchetto viene salvata una sola volta. Quando lo stesso pacchetto e richiesto in più progetti, pnpm non lo duplica.

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
| **Velocità install**       | Lento (download + copia)                     | Veloce (link se già presente) |
| **Strict mode**            | Permette accesso a dipendenze non dichiarate | Blocca phantom dependencies   |
| **Struttura node_modules** | Flat (hoisting)                              | Nested + symlinks             |
| **Determinismo**           | Può variare                                  | Garantito dal lockfile        |

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

### Perché Usiamo pnpm in questo Monorepo

1. **Efficienza disco**: Con molti script che condividono `go-common` e dipendenze AWS SDK, il risparmio e significativo
2. **Workspace nativi**: Supporto eccellente per monorepo con `workspace:*` protocol
3. **Strict mode**: Previene l'accesso accidentale a dipendenze non dichiarate
4. **Velocità**: Install incrementali molto più veloci dopo la prima esecuzione
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
  - functions/* # Lambda adapter packages

allowBuilds:
  esbuild: true
  unrs-resolver: true
```

### Naming Conventions

| Tipo      | Pattern                   | Esempio                                         |
| --------- | ------------------------- | ----------------------------------------------- |
| Packages  | `@go-automation/{name}`   | `@go-automation/go-common`                      |
| Scripts   | `{team}-{name}`           | `go-report-alarms`, `send-import-notifications` |
| Functions | `go-{descrizione}-lambda` | `go-send-monitor-tpp-messages-lambda`           |

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

# Esegui in tutte le function
pnpm -r --filter='./functions/**' build
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

Le function possono referenziare **sia** `go-common` **sia** uno script workspace esistente, così da riusarne direttamente `config.ts` e `main.ts`:

```json
{
  "dependencies": {
    "@go-automation/go-common": "workspace:*",
    "send-monitor-tpp-messages": "workspace:*"
  }
}
```

---

## Sistema di Build

### Build Pipeline

```text
┌─────────────────┐
│  go-common      │  Build TypeScript base shared by the repository
└────────┬────────┘
         │
         ├──────────────────────────────┐
         ▼                              ▼
┌─────────────────┐            ┌─────────────────┐
│  scripts/*      │            │ functions/*     │
│  CLI packages   │            │ Lambda adapters │
│  tsc / tsx      │            │ esbuild + tsc   │
└─────────────────┘            └─────────────────┘
```

### Ordine di Build

1. **`go-common`** - Deve essere compilato per primo perché è la base comune del repository
2. **`scripts/*`** - Possono essere compilati in parallelo dopo `go-common`
3. **`functions/*`** - Vengono compilate dopo `go-common` e, quando necessario, dopo lo script che riusano

### Comandi di Build

```bash
# Build standard (common + scripts)
pnpm build

# Build completo incluse le function
pnpm build:all

# Solo go-common
pnpm build:common

# Solo gli script
pnpm build:scripts

# Solo le function
pnpm build:functions

# Script specifico
pnpm --filter=go-report-alarms build

# Function specifica
pnpm --filter=go-send-monitor-tpp-messages-lambda build
```

### Script nel Root package.json

```json
{
  "scripts": {
    "build": "pnpm build:common && pnpm build:scripts",
    "build:all": "pnpm build:common && pnpm build:scripts && pnpm build:functions",
    "build:common": "pnpm --filter=@go-automation/go-common build",
    "build:scripts": "pnpm -r --filter='./scripts/**' build",
    "build:functions": "pnpm -r --filter='./functions/**' build",
    "test": "pnpm test:common && pnpm test:scripts",
    "test:coverage": "pnpm test:common:coverage && pnpm test:scripts:coverage",
    "validate:scaffold": "tsx bins/validate-scaffold/src/index.ts",
    "knip": "knip",
    "clean": "pnpm -r run clean",
    "clean:all": "pnpm clean && pnpm -r exec rm -rf node_modules && rm -rf node_modules"
  }
}
```

### Quality Gates, Coverage e Security

La build non è più solo compilazione: il monorepo usa una pipeline centralizzata che combina validazione strutturale, qualità statica, test e security audit.

| Livello              | Strumento                        | Scopo                                                           |
| -------------------- | -------------------------------- | --------------------------------------------------------------- |
| **Scaffold**         | `pnpm validate:scaffold`         | Verifica la struttura standard di ogni script                   |
| **Lint**             | `eslint.config.mjs`              | Regole TypeScript, security plugin e regole custom del progetto |
| **Unused code**      | `knip`                           | Individua export, file e dipendenze inutilizzati                |
| **Coverage**         | `test:coverage`                  | Applica soglie centralizzate su linee, branch e funzioni        |
| **CI orchestration** | `.github/workflows/ci-job.yml`   | Workflow riutilizzabile per tutti i job CI                      |
| **Security audit**   | `.github/workflows/security.yml` | `pnpm audit` su PR, push mirati e schedule periodica            |

---

## Dipendenze tra Package

### Grafico delle Dipendenze

```text
┌──────────────────────────────┐
│ scripts/*                    │
│ CLI packages                 │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ @go-automation/go-common     │
│ Core + AWS + SEND + JSON     │
│ Messaging + Runbook          │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ External dependencies        │
│ AWS SDK, prompts, yaml, ...  │
└──────────────────────────────┘

┌──────────────────────────────┐
│ functions/*                  │
│ Lambda adapters              │
├──────────────────────────────┤
│ importano:                   │
│ - uno script workspace       │
│ - @go-automation/go-common   │
└──────────────────────────────┘
```

### Dipendenze Esterne Principali

| Package                  | Uso                                                   |
| ------------------------ | ----------------------------------------------------- |
| `@aws-sdk/client-*`      | SDK AWS v3 per script, `go-common` e Lambda           |
| `esbuild`                | Bundling single-file delle function Lambda            |
| `tsx`                    | Dev mode, tooling interno e harness locali            |
| `prompts`                | Prompt interattivi, incapsulati in `GOPrompt`         |
| `yaml`                   | Parsing config YAML, mediato da `go-common`           |
| `csv-parse`              | Import CSV, mediato dagli importer/exporter condivisi |
| `eslint-plugin-security` | Hardening statico via regole di sicurezza             |

---

## TypeScript Configuration

### Configurazione Base (tsconfig.base.json)

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "lib": ["ES2024"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
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
4. **Riuso cross-package** - Le function possono referenziare sia `go-common` sia lo script workspace che adattano

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

Ogni script nel monorepo segue una **struttura a 3 file** validata sia dallo scaffolding tool sia dai quality gates (`validate:scaffold` + ESLint). L'obiettivo è mantenere netto il confine tra wiring, configurazione e business logic.

### Struttura Directory

```text
script/
├── src/
│   ├── index.ts              # Entry point minimale
│   ├── config.ts             # Solo metadata e parameters
│   ├── main.ts               # Solo funzione main()
│   ├── libs/                 # Helper e servizi estratti da main
│   └── types/
│       ├── MyScriptConfig.ts # Tipo di configurazione
│       └── index.ts          # Barrel file
├── configs/                  # Config locali del package
├── data/                     # Placeholder locale (gitkeep) se necessario
├── README.md
├── package.json
└── tsconfig.json
```

### Descrizione dei File

#### 1. `index.ts` - Wiring only

`index.ts` non contiene business logic. Si limita a:

- importare `scriptMetadata` e `scriptParameters`
- creare l'istanza `GOScript`
- invocare `main(script)`

```typescript
import { Core } from '@go-automation/go-common';

import { scriptMetadata, scriptParameters } from './config.js';
import { main } from './main.js';

const script = new Core.GOScript({
  metadata: scriptMetadata,
  config: {
    parameters: scriptParameters,
  },
});

script
  .run(async () => {
    await main(script);
  })
  .catch(() => {
    process.exit(1);
  });
```

#### 2. `config.ts` - Metadata e parametri

`config.ts` centralizza solo ciò che il framework deve sapere a priori:

- **`scriptMetadata`**: nome, versione, descrizione, autori
- **`scriptParameters`**: definizione parametri CLI/config con tipo, alias, default, `required`

```typescript
import { Core } from '@go-automation/go-common';

export const scriptMetadata: Core.GOScriptMetadata = {
  name: 'My Script',
  version: '1.0.0',
  description: 'Descrizione dello script',
  authors: ['Team GO - Gestione Operativa'],
};

export const scriptParameters: ReadonlyArray<Core.GOConfigParameterOptions> = [
  {
    name: 'input.file',
    type: Core.GOConfigParameterType.STRING,
    description: 'Path del file di input',
    required: true,
    aliases: ['i'],
  },
];
```

**Regola attuale**: `config.ts` **non** deve definire interfacce o type alias. I tipi di configurazione vivono in `src/types/`.

#### 3. `types/` - Config e tipi di dominio

Ogni tipo rilevante ha il suo file dedicato. Lo scaffolding genera almeno:

```typescript
// src/types/MyScriptConfig.ts
export interface MyScriptConfig {
  readonly inputFile: string;
}

// src/types/index.ts
export type { MyScriptConfig } from './MyScriptConfig.js';
```

Questo rende i tipi riutilizzabili da `main.ts`, test, helper e adapter Lambda senza mescolarli con il wiring.

#### 4. `main.ts` - Solo `main()`

Il file `main.ts` deve esportare la sola funzione `main()` e delegare ogni helper complesso a `src/libs/`.

```typescript
import { Core } from '@go-automation/go-common';

import type { MyScriptConfig } from './types/index.js';
import { MyService } from './libs/MyService.js';

export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<MyScriptConfig>();
  const service = new MyService(config);

  await service.process();
}
```

### Vincoli Strutturali Applicati dal Repository

| Regola                                      | Come viene applicata                                | Effetto                                              |
| ------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------- |
| `config.ts` espone solo metadata/parameters | `validate:scaffold`                                 | Niente interfacce o re-export di tipi in `config.ts` |
| `types/index.ts` obbligatorio               | `validate:scaffold`                                 | Tutti i tipi passano da un barrel coerente           |
| `main.ts` esporta solo `main()`             | ESLint custom `no-extra-functions-in-main`          | Helper estratti in `libs/`                           |
| `main.ts` resta piccolo                     | `max-lines`, `max-lines-per-function`, `complexity` | Business logic leggibile e componibile               |
| Import ESM espliciti `.js`                  | TypeScript + ESLint                                 | Compatibilità NodeNext coerente                      |

### Perché questa struttura è importante

| Vantaggio                            | Descrizione                                                             |
| ------------------------------------ | ----------------------------------------------------------------------- |
| **Separazione delle responsabilità** | Wiring, config, tipi e business logic hanno file distinti               |
| **Riutilizzo**                       | `config.ts` e `main.ts` possono essere importati dalle function Lambda  |
| **Testabilità**                      | `main.ts` e i file in `libs/` si testano senza passare dall'entry point |
| **Manutenibilità**                   | Il validatore impedisce derive strutturali tra script nuovi e vecchi    |
| **Evoluzione guidata**               | Lo scaffolding e i quality gates mantengono il monorepo uniforme        |

### Note Importanti

1. **`getConfiguration<T>()` è async**: va sempre usato con `await`
2. **`GOPaths` e `GOScript` gestiscono automaticamente il contesto di esecuzione**: monorepo, standalone e ambienti AWS-managed
3. **`functions/*` dipendono da questa struttura**: l'adapter Lambda riusa proprio `config.ts` e `main.ts`, quindi la separazione non è solo stilistica ma architetturale

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
- **Gitignore**: La directory `data/` è gitignored
- **Fallback AWS-managed**: quando l'ambiente non offre una base dir scrivibile standard, `GOPaths` può ricadere su percorsi come `/tmp`

---

## Deployment Modes

Gli script supportano due modalità runtime principali, **monorepo** e **standalone**, ma oggi il repository distingue chiaramente anche la **strategia di packaging**: script CLI standalone da una parte, adapter Lambda in `functions/*` dall'altra.

### GODeploymentMode

| Modalità     | Descrizione                   | Uso                      |
| ------------ | ----------------------------- | ------------------------ |
| `MONOREPO`   | Esecuzione dentro il monorepo | Sviluppo, CI/CD monorepo |
| `STANDALONE` | Deployment isolato            | Docker, Lambda, EC2      |

### Strategie di Packaging

| Target             | Dove vive     | Artefatto prodotto                                 | Tool principale                  |
| ------------------ | ------------- | -------------------------------------------------- | -------------------------------- |
| **CLI standalone** | `scripts/*`   | `artifacts/{script}/dist + node_modules + configs` | `bins/deploy.sh` / `pnpm deploy` |
| **Lambda**         | `functions/*` | `artifacts/{function}/handler.mjs + configs`       | `esbuild.config.mjs`             |

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

### Pattern CLI → Lambda

La novità architetturale principale delle ultime settimane è l'introduzione di un adapter Lambda che **riusa esattamente lo stesso contratto** dello script CLI:

```text
scripts/send/send-monitor-tpp-messages/src/index.ts
  └── GOScript.run() ───────────────▶ main(script)

functions/go-SendMonitorTppMessagesLambda/src/handler.ts
  └── GOScript.createLambdaHandler() ▶ main(script)
```

Questo riduce la duplicazione e rende la Lambda un layer di delivery, non un secondo punto di implementazione della logica.

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

**AWS-managed / Lambda note:**

- In ambienti AWS-managed la risoluzione dei path usa `GOPaths` per trovare directory scrivibili
- Per le Lambda il bundle viene generato in `artifacts/`, ma a runtime i file temporanei e gli output possono finire sotto `/tmp`
- La configurazione può arrivare da env vars, event payload e defaults definiti in `scriptParameters`

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
# Crea il package standalone in artifacts/
./bins/deploy.sh --script go-report-alarms

# Oppure lavora sul package specifico
pnpm --filter=go-report-alarms build
pnpm --filter=go-report-alarms start
```

### Packaging Lambda

Per costruire il bundle della Lambda:

```bash
# Build del package function
pnpm --filter=go-send-monitor-tpp-messages-lambda build

# Test locale della function
pnpm --filter=go-send-monitor-tpp-messages-lambda test:local
```

Il package function dipende sia da `@go-automation/go-common` sia dallo script `send-monitor-tpp-messages`, quindi il deploy Lambda eredita automaticamente la business logic e il contratto di configurazione dello script sorgente.

---

## Riferimenti

- [pnpm Workspaces](https://pnpm.io/workspaces)
- [TypeScript Project References](https://www.typescriptlang.org/docs/handbook/project-references.html)
- [go-common Documentation](GOCOMMON.md)
- [Scripts Guide](SCRIPTS.md)
- [Coding Guidelines](GUIDE_LINES.md)

---

**Ultima modifica**: 2026-04-09
**Maintainer**: Team GO - Gestione Operativa
