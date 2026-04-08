# Guida alla Creazione di Nuovi Script

> Guida completa per la creazione di nuovi script nel monorepo GO Automation.

## Indice

1. [Introduzione](#introduzione)
2. [Prerequisiti](#prerequisiti)
3. [Creazione Rapida (Raccomandato)](#creazione-rapida-raccomandato)
4. [Struttura del Monorepo](#struttura-del-monorepo)
5. [Guida Passo-Passo](#guida-passo-passo)
6. [Framework GOScript](#framework-goscript)
7. [Template Completo](#template-completo)
8. [Comandi pnpm](#comandi-pnpm)
9. [Best Practices](#best-practices)
10. [Standalone Deployment](#standalone-deployment)
11. [Troubleshooting](#troubleshooting)

---

## Introduzione

### Cos'e GO Automation?

GO Automation e un monorepo TypeScript che contiene script di automazione per i team GO (Gestione Operativa), SEND e INTEROP di PagoPa. Il monorepo utilizza:

- **pnpm workspaces** per la gestione delle dipendenze
- **TypeScript strict mode** per la type safety
- **@go-automation/go-common** come libreria condivisa

### Vantaggi del Monorepo

- **Codice condiviso**: La libreria `go-common` fornisce utilities riutilizzabili
- **Configurazione unificata**: TypeScript e ESLint condivisi
- **Build incrementali**: TypeScript project references per build veloci
- **Gestione dipendenze**: pnpm workspace protocol per dipendenze locali

---

## Prerequisiti

### Software Richiesto

| Software | Versione Minima | Verifica Installazione |
| -------- | --------------- | ---------------------- |
| Node.js  | >= 24.0.0       | `node --version`       |
| pnpm     | >= 10.0.0       | `pnpm --version`       |
| Git      | qualsiasi       | `git --version`        |

### Installazione pnpm

```bash
# Con npm
npm install -g pnpm

# Con Homebrew (macOS)
brew install pnpm

# Con Corepack (Node.js >= 16.13)
corepack enable
corepack prepare pnpm@latest --activate
```

### Setup Iniziale del Monorepo

```bash
# Clona il repository
git clone git@github.com:pagopa/go-automation.git
cd go-automation

# Installa tutte le dipendenze
pnpm install

# Build della libreria comune (necessario prima degli script)
pnpm build:common
```

---

## Creazione Rapida (Raccomandato)

Il modo piu veloce per creare un nuovo script e usare lo script di scaffolding interattivo.

### Utilizzo dello Script di Scaffolding

```bash
# Dalla root del monorepo
./bins/create-script.sh
```

Lo script ti guidera attraverso un processo interattivo:

1. **Selezione del prodotto** - Usa i tasti freccia per navigare:

   ```
   [*] Select the product for your new script:
   (Use arrow keys to navigate, Enter to select)

     ✔  go      Gestione Operativa
        send    SEND Platform
        interop Interoperability
   ```

2. **Nome dello script** - Inserisci il nome nel formato `verbo-descrizione`:

   ```
   Script name: report-metrics
   ```

   Il nome finale sara `{prodotto}-{nome}` (es. `go-report-metrics`)

3. **Descrizione** - Inserisci una breve descrizione dello script

Lo script creera automaticamente:

- Directory `scripts/{prodotto}/{prodotto}-{nome}/`
- Sottocartelle `src/libs`, `src/types`, `configs`, `logs`
- File `package.json`, `tsconfig.json`
- Entry point `src/main.ts` con template GOScript
- Esecuzione di `pnpm install`
- Verifica del build

### Output Finale

```
============================================
  Script Created Successfully!
============================================

  Location:    scripts/go/go-report-metrics
  Entry Point: src/main.ts

  Commands:
    pnpm --filter=go-report-metrics build # Build the script
    pnpm --filter=go-report-metrics dev   # Run in development mode
    pnpm --filter=go-report-metrics start # Build and run
```

4. **Aggiunta shortcuts** - Lo script chiede se aggiungere gli shortcuts al `package.json` root:

   ```
   [?] Add shortcuts to root package.json?

     ✔  Yes     No
   ```

   Se selezioni **Yes**, verranno aggiunti:
   - `go:report:metrics:dev` - Run in development mode
   - `go:report:metrics:prod` - Build and run
   - `go:report:metrics:build` - Build only

### Dopo la Creazione

1. **Modifica `src/main.ts`** con la logica del tuo script

2. **Aggiungi i parametri** necessari nell'array `config.parameters`

3. **Crea classi di servizio** in `src/libs/` per la business logic

4. **Definisci i tipi** in `src/types/` per le interfacce

5. **Verifica che tutto funzioni**:
   ```bash
   pnpm go:report:metrics:dev -- --help
   # oppure
   pnpm --filter=go-report-metrics dev -- --help
   ```

---

## Struttura del Monorepo

### Overview della Directory

```
go-automation/
├── packages/
│   └── go-common/              # Libreria condivisa @go-automation/go-common
│       ├── src/
│       │   └── libs/
│       │       ├── core/       # Utilities core (GOScript, logging, config)
│       │       ├── aws/        # Utilities AWS (credentials manager)
│       │       └── send/       # Utilities SEND-specifiche
│       └── package.json
│
├── scripts/
│   ├── go/                     # Script per team GO
│   │   └── go-report-alarms/   # Esempio: analisi allarmi CloudWatch
│   ├── send/                   # Script per team SEND
│   │   ├── send-monitor-tpp-messages/
│   │   └── send-import-notifications/
│   └── interop/                # Script per team INTEROP (futuro)
│
├── docs/                       # Documentazione
├── tsconfig.base.json          # Configurazione TypeScript condivisa
├── pnpm-workspace.yaml         # Configurazione workspace pnpm
└── package.json                # Root package.json
```

### Configurazione Workspace (pnpm-workspace.yaml)

```yaml
packages:
  - packages/* # Librerie condivise (@go-automation/*)
  - scripts/go/* # Script team GO
  - scripts/send/* # Script team SEND
  - scripts/interop/* # Script team INTEROP
```

### Naming Conventions

| Tipo      | Convenzione                      | Esempio                     |
| --------- | -------------------------------- | --------------------------- |
| Packages  | `@go-automation/package-name`    | `@go-automation/go-common`  |
| Scripts   | `team-nome-script` (senza scope) | `go-report-alarms`          |
| Team GO   | `go-*`                           | `go-report-alarms`          |
| Team SEND | `send-*`                         | `send-import-notifications` |

---

## Guida Passo-Passo

Questa sezione descrive la creazione manuale di uno script. Per un approccio piu rapido, vedi la sezione [Creazione Rapida](#creazione-rapida-raccomandato).

### Passo 1: Creare la Directory dello Script

```bash
# Per team GO
mkdir -p scripts/go/go-my-script/src/{libs,types}
cd scripts/go/go-my-script

# Per team SEND
mkdir -p scripts/send/send-my-script/src/{libs,types}
cd scripts/send/send-my-script

# Per team INTEROP
mkdir -p scripts/interop/interop-my-script/src/{libs,types}
cd scripts/interop/interop-my-script
```

### Passo 2: Creare package.json

Crea il file `package.json` nella directory dello script:

```json
{
  "name": "go-my-script",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "Descrizione del tuo script",
  "main": "dist/main.js",
  "scripts": {
    "build": "tsc",
    "start": "pnpm build && node dist/main.js",
    "dev": "tsx src/main.ts",
    "watch": "tsc --watch",
    "clean": "rm -rf dist *.tsbuildinfo"
  },
  "keywords": ["automation", "typescript", "go-automation"],
  "author": "Team GO - Gestione Operativa",
  "license": "ISC",
  "dependencies": {
    "@go-automation/go-common": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^24.10.9"
  }
}
```

**Note importanti:**

- `"type": "module"` - Abilita ESM (ECMAScript Modules)
- `"@go-automation/go-common": "workspace:*"` - Usa la versione locale della libreria
- `"main": "dist/main.js"` - Entry point e `main.ts` (non `index.ts`)
- `devDependencies` minimali - `typescript` e `tsx` sono ereditati dalla root

### Passo 3: Creare tsconfig.json

Crea il file `tsconfig.json` che estende la configurazione base:

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
  "exclude": ["node_modules", "dist", "configs", "logs", "reports"],
  "references": [
    {
      "path": "../../../packages/go-common"
    }
  ]
}
```

**Note importanti:**

- `extends` - Eredita tutte le opzioni strict da `tsconfig.base.json`
- `composite: true` - Abilita project references per build incrementali
- `references` - Dichiara la dipendenza da `go-common`

### Passo 4: Creare la Struttura a 3 File

Gli script seguono una struttura a 3 file per una chiara separazione delle responsabilita.

#### 4.1 Creare `src/config.ts` - Configurazione

```typescript
/**
 * GO My Script - Configuration Module
 *
 * Contains script metadata, parameters definition, and configuration interface.
 */

import { Core } from '@go-automation/go-common';

/**
 * Script metadata
 */
export const scriptMetadata: Core.GOScriptMetadata = {
  name: 'GO My Script',
  version: '1.0.0',
  description: 'Descrizione dettagliata dello script',
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
    name: 'output.dir',
    type: Core.GOConfigParameterType.STRING,
    description: 'Directory di output (opzionale)',
    required: false,
    aliases: ['o'],
  },
  {
    name: 'verbose',
    type: Core.GOConfigParameterType.BOOL,
    description: 'Abilita output dettagliato',
    required: false,
    defaultValue: false,
    aliases: ['v'],
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
  readonly outputDir?: string;
  readonly verbose: boolean;
  readonly awsProfile: string;
}
```

#### 4.2 Creare `src/main.ts` - Business Logic

```typescript
/**
 * GO My Script - Main Logic Module
 *
 * Contains the core business logic.
 */

import { Core } from '@go-automation/go-common';

import type { MyScriptConfig } from './config.js';

/**
 * Main script execution function
 *
 * @param script - The GOScript instance for logging and prompts
 */
export async function main(script: Core.GOScript): Promise<void> {
  // Ottieni la configurazione tipizzata (ASYNC - usa await!)
  const config = await script.getConfiguration<MyScriptConfig>();

  // Logga le informazioni di avvio
  script.logger.section('Avvio Elaborazione');
  script.logger.info(`File input: ${config.inputFile}`);

  if (config.outputDir) {
    script.logger.info(`Directory output: ${config.outputDir}`);
  }

  // Mostra spinner durante operazioni lunghe
  script.prompt.startSpinner('Elaborazione in corso...');

  try {
    // La tua logica di business qui
    await processData(config);

    script.prompt.spinnerStop('Elaborazione completata');
  } catch (error) {
    script.prompt.spinnerFail('Elaborazione fallita');
    throw error;
  }

  // Logga i risultati
  script.logger.section('Risultati');
  script.logger.success('Script completato con successo');
}

/**
 * Funzione di elaborazione dati
 * Complexity: O(N) dove N e il numero di record
 */
async function processData(config: MyScriptConfig): Promise<void> {
  // Implementa la tua logica qui
  if (config.verbose) {
    // Log dettagliati
  }
}
```

#### 4.3 Creare `src/index.ts` - Entry Point

```typescript
/**
 * GO My Script - Entry Point
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
 *
 * Note: Signal handlers (SIGTERM, SIGINT, SIGQUIT) are automatically
 * configured by GOScript.run() for graceful shutdown.
 */
script
  .run(async () => {
    await main(script);
  })
  .catch(() => {
    process.exit(1);
  });
```

### Passo 5: Struttura Raccomandata delle Directory

```
go-my-script/
├── src/
│   ├── index.ts              # Entry point minimale
│   ├── config.ts             # Metadata, parameters, interface
│   ├── main.ts               # Business logic
│   ├── libs/                 # Business logic helpers
│   │   ├── DataProcessor.ts  # Classi di servizio
│   │   └── ReportGenerator.ts
│   └── types/                # Type definitions
│       └── DataTypes.ts      # Altri tipi (non Config!)
├── configs/                  # File di configurazione
│   ├── config.json           # Configurazione JSON
│   ├── config.yaml           # O configurazione YAML
│   └── .env                  # Variabili d'ambiente (gitignored)
├── logs/                     # Log files (gitignored)
├── reports/                  # Output reports (gitignored)
│   └── .gitkeep              # Mantiene la directory in git
├── package.json
└── tsconfig.json
```

### Passo 6: Aggiungere Script Shortcuts (Root package.json)

Aggiungi gli script shortcuts nel `package.json` root:

```json
{
  "scripts": {
    "go:my:script:dev": "pnpm --filter=go-my-script dev",
    "go:my:script:prod": "pnpm --filter=go-my-script start",
    "go:my:script:build": "pnpm --filter=go-my-script build"
  }
}
```

### Passo 7: Installare e Build

```bash
# Dalla root del monorepo
cd /path/to/go-automation

# Installa dipendenze
pnpm install

# Build go-common (se non gia fatto)
pnpm build:common

# Build il nuovo script
pnpm --filter=go-my-script build

# Esegui in dev mode
pnpm go:my:script -- --input-file=data.csv
```

---

## Framework GOScript

### Overview

`GOScript` e il framework base per creare script CLI nel monorepo. Fornisce:

- **Gestione configurazione**: CLI args, file JSON/YAML, variabili d'ambiente
- **Logging strutturato**: Console e file logging
- **Prompt interattivi**: Spinner, conferme, input
- **AWS credentials**: Gestione automatica SSO
- **Lifecycle hooks**: Controllo completo del ciclo di vita

### Importazione

```typescript
import { Core } from '@go-automation/go-common';

// Componenti principali
const script = new Core.GOScript({ ... });
const paramType = Core.GOConfigParameterType.STRING;
const pathType = Core.GOPathType.INPUT;
```

### Configurazione Metadata

```typescript
const script = new Core.GOScript({
  metadata: {
    name: 'Nome Script', // Nome visualizzato
    version: '1.0.0', // Versione (SemVer)
    description: 'Descrizione', // Descrizione dettagliata
    authors: ['Team GO'], // Autori (array)
  },
  // ... altre opzioni
});
```

### Tipi di Parametro (GOConfigParameterType)

| Tipo           | Descrizione          | Esempio CLI                    |
| -------------- | -------------------- | ------------------------------ |
| `STRING`       | Stringa              | `--name "valore"`              |
| `INT`          | Intero               | `--count 10`                   |
| `DOUBLE`       | Decimale             | `--threshold 0.5`              |
| `BOOL`         | Booleano             | `--verbose` o `--verbose=true` |
| `STRING_ARRAY` | Array di stringhe    | `--tags tag1,tag2,tag3`        |
| `INT_ARRAY`    | Array di interi      | `--ids 1,2,3`                  |
| `DOUBLE_ARRAY` | Array di decimali    | `--values 1.5,2.5,3.5`         |
| `BOOL_ARRAY`   | Array di booleani    | `--flags true,false,true`      |
| `BUFFER`       | Dati binari (base64) | `--data <base64>`              |

### Definizione Parametri

```typescript
{
  config: {
    parameters: [
      // Parametro stringa required
      {
        name: 'input.file',              // Nome (dot notation)
        type: Core.GOConfigParameterType.STRING,
        description: 'Path del file di input',
        required: true,
        aliases: ['i', 'in'],            // Alias brevi
      },

      // Parametro opzionale con default
      {
        name: 'output.format',
        type: Core.GOConfigParameterType.STRING,
        description: 'Formato output (json, csv)',
        required: false,
        defaultValue: 'json',
        aliases: ['f'],
      },

      // Parametro booleano (flag)
      {
        name: 'dry.run',
        type: Core.GOConfigParameterType.BOOL,
        description: 'Esegui senza modifiche reali',
        required: false,
        defaultValue: false,
        aliases: ['d'],
      },

      // AWS Profile (abilita gestione credenziali automatica)
      {
        name: 'aws.profile',
        type: Core.GOConfigParameterType.STRING,
        description: 'Nome profilo AWS SSO',
        required: true,
        aliases: ['ap'],
      },
    ],
  },
}
```

**Convenzioni naming parametri:**

- Usa `dot.notation` per nomi composti: `start.date`, `aws.profile`
- Il sistema converte automaticamente in:
  - CLI flags: `--start-date`, `--aws-profile`
  - Variabili ambiente: `START_DATE`, `AWS_PROFILE`
  - Property camelCase: `startDate`, `awsProfile`

### Priorita Configurazione

I valori vengono letti in ordine di priorita (il primo vince):

1. **Command line arguments**: `--param-name value`
2. **File JSON** (`configs/config.json`)
3. **File YAML** (`configs/config.yaml`)
4. **Variabili d'ambiente** e file `.env`
5. **Valori default** definiti nei parametri

### Ottenere la Configurazione Tipizzata

```typescript
// Definisci l'interfaccia
interface MyConfig {
  readonly inputFile: string; // da 'input.file'
  readonly outputFormat: string; // da 'output.format'
  readonly dryRun: boolean; // da 'dry.run'
  readonly awsProfile: string; // da 'aws.profile'
}

// Ottieni i valori tipizzati
const config = script.getConfiguration<MyConfig>();

console.log(config.inputFile); // string
console.log(config.dryRun); // boolean
```

### Lifecycle Hooks

```typescript
const script = new Core.GOScript({
  // ... metadata e config

  hooks: {
    // Prima dell'inizializzazione
    onBeforeInit: async () => {
      console.log('Preparazione...');
    },

    // Dopo l'inizializzazione
    onAfterInit: async () => {
      console.log('Inizializzato');
    },

    // Prima del caricamento config
    onBeforeConfigLoad: async () => {
      console.log('Caricamento config...');
    },

    // Dopo il caricamento config
    onAfterConfigLoad: async (config) => {
      console.log('Config caricata:', config);
    },

    // Prima dell'esecuzione main
    onBeforeRun: async () => {
      console.log('Avvio...');
    },

    // Dopo l'esecuzione main
    onAfterRun: async () => {
      console.log('Completato');
    },

    // In caso di errore
    onError: async (error) => {
      console.error('Errore:', error.message);
    },

    // Durante cleanup
    onCleanup: async () => {
      console.log('Cleanup...');
    },
  },
});
```

### Logger

```typescript
// Sezione con header
script.logger.section('Titolo Sezione');

// Livelli di log
script.logger.info('Messaggio informativo');
script.logger.warning('Attenzione!');
script.logger.error('Errore critico');
script.logger.success('Operazione completata');
script.logger.text('Testo semplice');
script.logger.fatal('Errore fatale (solo su file)');

// Formattazione
script.logger.newline();

// Tabella formattata
script.logger.table({
  columns: [
    { header: 'Nome', key: 'name', width: 20 },
    { header: 'Valore', key: 'value', width: 30 },
  ],
  data: [
    { name: 'Parametro 1', value: 'Valore 1' },
    { name: 'Parametro 2', value: 'Valore 2' },
  ],
  border: true,
  headerSeparator: true,
});
```

### Prompt e Spinner

```typescript
// Spinner semplice
script.prompt.startSpinner('Caricamento...');
// ... operazione
script.prompt.spinnerStop('Caricamento completato');
// oppure
script.prompt.spinnerFail('Caricamento fallito');

// Multi-spinner (per operazioni parallele)
script.prompt.spin('task1', 'Elaborazione file 1...');
script.prompt.spin('task2', 'Elaborazione file 2...');
script.prompt.spinSucceed('task1', 'File 1 completato');
script.prompt.spinFail('task2', 'File 2 fallito');

// Conferma interattiva
const confirmed = await script.prompt.confirm('Procedere?', true);
if (confirmed) {
  // ...
}

// Stop tutti gli spinner
script.prompt.stopSpinner();
```

### Gestione AWS Credentials

Se lo script definisce il parametro `aws.profile`, GOScript gestisce automaticamente:

1. **Rilevamento ambiente**: Local, CI, AWS Lambda, ECS, EC2
2. **Validazione credenziali SSO**
3. **Login automatico** se le credenziali sono scadute (solo in ambiente interattivo)

```typescript
// Il parametro aws.profile abilita la gestione automatica
{
  name: 'aws.profile',
  type: Core.GOConfigParameterType.STRING,
  description: 'AWS SSO profile name',
  required: true,
  aliases: ['ap'],
}

// Opzioni avanzate per le credenziali
{
  config: {
    parameters: [...],
    awsCredentials: {
      autoLogin: true,        // Login automatico se scadute
      interactive: true,      // Chiedi conferma prima del login
      maxRetries: 1,          // Tentativi dopo login
      loginTimeout: 120000,   // Timeout login (2 min)
    },
  },
}
```

### File Copier

GOScript include un sistema per copiare file nella directory di esecuzione:

```typescript
// Registra file per la copia
const inputPath = script.resolveAndRegisterFile('data.csv', Core.GOPathType.INPUT);
const configPath = script.resolveAndRegisterFile('config.yaml', Core.GOPathType.CONFIG);

// A fine script, copia tutti i file registrati
const report = await script.finalizeFiles();
script.logger.info(`Copiati ${report.summary.copiedFiles} file`);
```

### Path Resolution

```typescript
// Risolvi path relativi
const inputPath = script.paths.resolvePath('data.csv', Core.GOPathType.INPUT);
// -> data/{script-name}/inputs/data.csv

const outputPath = script.paths.resolvePath('report.csv', Core.GOPathType.OUTPUT);
// -> data/{script-name}/outputs/{script}_{timestamp}/report.csv

const configPath = script.paths.resolvePath('config.json', Core.GOPathType.CONFIG);
// -> data/{script-name}/configs/config.json (con fallback locale)

// Con informazioni dettagliate
const pathInfo = script.paths.resolvePathWithInfo('file.csv', Core.GOPathType.OUTPUT);
if (pathInfo && !pathInfo.isAbsolute) {
  console.log('Directory:', pathInfo.resolvedDir);
}
```

---

## Template Completo

### Struttura File (3 File Pattern)

```
go-my-script/
├── src/
│   ├── index.ts              # Entry point minimale
│   ├── config.ts             # Metadata, parameters, interface
│   ├── main.ts               # Business logic
│   ├── libs/
│   │   └── MyService.ts
│   └── types/
│       └── DataTypes.ts      # Altri tipi (non Config!)
├── configs/
│   └── config.json
├── logs/
├── reports/
│   └── .gitkeep
├── package.json
└── tsconfig.json
```

### package.json

```json
{
  "name": "go-my-script",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "Script di automazione per [descrizione]",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "pnpm build && node dist/index.js",
    "dev": "tsx src/index.ts",
    "watch": "tsc --watch",
    "clean": "rm -rf dist *.tsbuildinfo"
  },
  "keywords": ["automation", "typescript", "go-automation"],
  "author": "Team GO - Gestione Operativa",
  "license": "ISC",
  "dependencies": {
    "@go-automation/go-common": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^24.10.9"
  }
}
```

**Nota**: `main` e `dev` puntano a `index.ts`/`index.js`, non a `main.ts`.

### tsconfig.json

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
  "exclude": ["node_modules", "dist", "configs", "logs", "reports"],
  "references": [
    {
      "path": "../../../packages/go-common"
    }
  ]
}
```

### src/config.ts

```typescript
/**
 * GO My Script - Configuration Module
 *
 * Contains script metadata, parameters definition, and configuration interface.
 */

import { Core } from '@go-automation/go-common';

/**
 * Script metadata
 */
export const scriptMetadata: Core.GOScriptMetadata = {
  name: 'GO My Script',
  version: '1.0.0',
  description: 'Elabora dati e genera report',
  authors: ['Team GO - Gestione Operativa'],
};

/**
 * Script parameter definitions
 */
export const scriptParameters: ReadonlyArray<Core.GOConfigParameterOptions> = [
  {
    name: 'input.file',
    type: Core.GOConfigParameterType.STRING,
    description: 'Path del file CSV di input',
    required: true,
    aliases: ['i'],
  },
  {
    name: 'output.dir',
    type: Core.GOConfigParameterType.STRING,
    description: 'Directory per i file di output',
    required: false,
    aliases: ['o'],
  },
  {
    name: 'verbose',
    type: Core.GOConfigParameterType.BOOL,
    description: 'Abilita log dettagliati',
    required: false,
    defaultValue: false,
    aliases: ['v'],
  },
  {
    name: 'aws.profile',
    type: Core.GOConfigParameterType.STRING,
    description: 'Profilo AWS SSO',
    required: true,
    aliases: ['ap'],
  },
] as const;

/**
 * Script configuration interface
 */
export interface MyScriptConfig {
  /** Path del file di input */
  readonly inputFile: string;

  /** Directory di output (opzionale) */
  readonly outputDir?: string;

  /** Abilita output dettagliato */
  readonly verbose: boolean;

  /** Profilo AWS SSO */
  readonly awsProfile: string;
}
```

### src/libs/MyService.ts

````typescript
/**
 * MyService - Servizio di elaborazione dati
 * Implementa la logica di business dello script
 */

/**
 * Risultato dell'elaborazione
 */
export interface ProcessingResult {
  /** Numero di record elaborati */
  readonly processedCount: number;

  /** Numero di errori */
  readonly errorCount: number;

  /** Tempo di elaborazione in ms */
  readonly durationMs: number;
}

/**
 * Servizio per l'elaborazione dei dati
 */
export class MyService {
  private readonly verbose: boolean;

  constructor(verbose: boolean = false) {
    this.verbose = verbose;
  }

  /**
   * Elabora i dati dal file di input
   * Complexity: O(N) dove N e il numero di record
   *
   * @param inputPath - Path del file di input
   * @returns Risultato dell'elaborazione
   *
   * @example
   * ```typescript
   * const service = new MyService(true);
   * const result = await service.process('/path/to/input.csv');
   * console.log(`Elaborati ${result.processedCount} record`);
   * ```
   */
  async process(inputPath: string): Promise<ProcessingResult> {
    const startTime = Date.now();
    let processedCount = 0;
    let errorCount = 0;

    // Implementa la logica di elaborazione
    // ...

    return {
      processedCount,
      errorCount,
      durationMs: Date.now() - startTime,
    };
  }
}
````

### src/main.ts

```typescript
/**
 * GO My Script - Main Logic Module
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

  // Inizializza il servizio
  script.logger.section('Inizializzazione');
  const service = new MyService(config.verbose);
  script.logger.success('Servizio inizializzato');

  // Elabora i dati
  script.logger.section('Elaborazione Dati');
  script.prompt.startSpinner('Elaborazione in corso...');

  try {
    const result = await service.process(config.inputFile);
    script.prompt.spinnerStop('Elaborazione completata');

    // Mostra i risultati
    script.logger.section('Risultati');
    script.logger.table({
      columns: [
        { header: 'Metrica', key: 'metric', width: 25 },
        { header: 'Valore', key: 'value', width: 15 },
      ],
      data: [
        { metric: 'Record elaborati', value: result.processedCount },
        { metric: 'Errori', value: result.errorCount },
        { metric: 'Durata (ms)', value: result.durationMs },
      ],
      border: true,
    });

    // Verifica errori
    if (result.errorCount > 0) {
      script.logger.warning(`Completato con ${result.errorCount} errori`);
    }
  } catch (error) {
    script.prompt.spinnerFail('Elaborazione fallita');
    throw error;
  }
}
```

### src/index.ts

```typescript
/**
 * GO My Script - Entry Point
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
  logging: {
    console: true,
    file: true,
    logConfigOnStart: true,
  },
});

/**
 * Run the script with lifecycle management
 *
 * Note: Signal handlers (SIGTERM, SIGINT, SIGQUIT) are automatically
 * configured by GOScript.run() for graceful shutdown.
 */
script
  .run(async () => {
    await main(script);
  })
  .catch(() => {
    process.exit(1);
  });
```

### configs/config.json (esempio)

```json
{
  "input": {
    "file": "./data/input.csv"
  },
  "output": {
    "dir": "./reports"
  },
  "verbose": false
}
```

---

## Comandi pnpm

### Build

```bash
# Build tutti i package @go-automation
pnpm build

# Build solo go-common
pnpm build:common

# Build solo gli script
pnpm build:scripts

# Build script specifico
pnpm --filter=go-my-script build
```

### Esecuzione

```bash
# Dev mode (con tsx, senza build)
pnpm --filter=go-my-script dev

# Production mode (build + node)
pnpm --filter=go-my-script start

# Con parametri CLI
pnpm --filter=go-my-script dev -- --input-file=data.csv --verbose

# Usando gli shortcuts (se definiti in root package.json)
pnpm go:my:script:dev -- --input-file=data.csv
```

### Dipendenze

```bash
# Aggiungi dipendenza a uno script
pnpm --filter=go-my-script add lodash

# Aggiungi dev dependency
pnpm --filter=go-my-script add -D @types/lodash

# Aggiungi go-common (workspace protocol)
pnpm --filter=go-my-script add @go-automation/go-common@workspace:*
```

### Utility

```bash
# Clean build artifacts
pnpm --filter=go-my-script clean

# Type check senza build
pnpm --filter=go-my-script exec tsc --noEmit

# Watch mode
pnpm --filter=go-my-script watch
```

### Filtri Avanzati

```bash
# Esegui in tutti gli script
pnpm -r --filter='./scripts/**' build

# Esegui in script e sue dipendenze
pnpm --filter=go-my-script... build

# Esegui in tutti tranne uno
pnpm -r --filter='!go-my-script' clean
```

---

## Best Practices

### TypeScript Strict Mode

Il progetto usa `tsconfig.base.json` con strict mode completo. Punti chiave:

```typescript
// noUncheckedIndexedAccess: array[i] e sempre T | undefined
const items = [1, 2, 3];
const first = items[0]; // Type: number | undefined

// Controllo esplicito necessario
if (items.length > 0) {
  const first = items[0]!; // Safe: verificato che esiste
}

// Usa Map per lookup sicuri
const map = new Map<string, number>();
const value = map.get('key'); // Type: number | undefined
```

### One Type Per File

```typescript
// CORRETTO: Un file per tipo
// types/User.ts
export interface User { ... }

// types/Product.ts
export interface Product { ... }

// SBAGLIATO: Multipli tipi in un file
// types/types.ts
export interface User { ... }
export interface Product { ... }
```

### Immutabilita con readonly

```typescript
// Interfacce con readonly
interface Config {
  readonly apiUrl: string;
  readonly items: readonly string[];
}

// Parametri funzione readonly
function process(items: readonly Item[]): Result {
  // items non puo essere modificato
}
```

### Performance First

```typescript
// CORRETTO: O(N) con Map
const counts = new Map<string, number>();
for (const item of items) {
  counts.set(item.id, (counts.get(item.id) ?? 0) + 1);
}

// SBAGLIATO: O(N^2) con filter ripetuti
const counts = items.map((item) => ({
  id: item.id,
  count: items.filter((i) => i.id === item.id).length,
}));
```

### Named Exports (No Default)

```typescript
// CORRETTO: Named exports
export class MyService { ... }
export interface MyConfig { ... }
export function processData() { ... }

// SBAGLIATO: Default export
export default class MyService { ... }
```

### for...of invece di forEach

```typescript
// CORRETTO: for...of
for (const item of items) {
  console.log(item);
}

// SBAGLIATO: forEach
items.forEach((item) => console.log(item));
```

### JSDoc per Funzioni Pubbliche

````typescript
/**
 * Elabora gli allarmi in base ai pattern di ignore
 * Complexity: O(N) dove N e il numero di allarmi
 *
 * @param alarms - Array di allarmi da filtrare
 * @param patterns - Pattern di ignore
 * @returns Allarmi filtrati divisi in ignored e not ignored
 *
 * @example
 * ```typescript
 * const result = filterAlarms(alarms, ['test', 'dev']);
 * console.log(result.notIgnored.length);
 * ```
 */
export function filterAlarms(alarms: readonly Alarm[], patterns: readonly string[]): FilteredAlarms {
  // ...
}
````

---

## Standalone Deployment

Gli script possono essere eseguiti in modalità "standalone" al di fuori del monorepo, utile per deployment in Docker, Lambda, EC2, o altri ambienti isolati.

### Modalità di Deployment

| Modalità     | Descrizione             | Rilevamento                             |
| ------------ | ----------------------- | --------------------------------------- |
| `MONOREPO`   | Esecuzione nel monorepo | Automatico se trova pnpm-workspace.yaml |
| `STANDALONE` | Deployment isolato      | Default se non trova marker monorepo    |

### Configurazione Standalone

Usa variabili d'ambiente per configurare i path in standalone mode:

```bash
# Forza standalone mode
export GO_DEPLOYMENT_MODE=standalone

# Configura directory base
export GO_BASE_DIR=/app

# Override directory specifiche (opzionale)
export GO_DATA_DIR=/app/data
export GO_CONFIG_DIR=/app/configs
export GO_INPUT_DIR=/app/data/inputs
export GO_OUTPUT_DIR=/app/data/outputs
```

### Struttura Directory Standalone

```
/app/                            # GO_BASE_DIR
├── configs/                     # GO_CONFIG_DIR
│   ├── config.json
│   └── .env
├── data/                        # GO_DATA_DIR
│   ├── inputs/                  # GO_INPUT_DIR
│   └── outputs/                 # GO_OUTPUT_DIR
│       └── script_{timestamp}/
└── dist/
    └── main.js
```

### Dockerfile Esempio

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copia file compilati
COPY dist/ ./dist/
COPY configs/ ./configs/
COPY package.json package-lock.json ./

# Variabili d'ambiente per standalone mode
ENV GO_DEPLOYMENT_MODE=standalone
ENV GO_BASE_DIR=/app
ENV GO_DATA_DIR=/app/data
ENV GO_CONFIG_DIR=/app/configs
ENV NODE_ENV=production

# Crea directory dati
RUN mkdir -p /app/data/inputs /app/data/outputs

# Installa solo dipendenze production
RUN npm ci --only=production

# Entry point
CMD ["node", "dist/main.js"]
```

### Build per Standalone

```bash
# Build completo
pnpm --filter=my-script build

# Crea package per deployment
mkdir -p deploy
cp -r scripts/go/my-script/dist deploy/
cp -r scripts/go/my-script/configs deploy/
cp scripts/go/my-script/package.json deploy/

# In deploy/, installa dipendenze
cd deploy && npm install --production
```

### Verifica Deployment Mode in Runtime

```typescript
import { Core } from '@go-automation/go-common';

// Nel tuo script
script.run(async () => {
  const paths = script.paths;

  // Verifica modalità
  console.log('Deployment mode:', paths.getDeploymentMode());
  console.log('Is standalone:', paths.isStandalone());
  console.log('Is monorepo:', paths.isMonorepo());

  // Mostra configurazione path
  console.log('Base dir:', paths.getBaseDir());
  console.log('Data dir:', paths.getDataDir());
  console.log('Config dir:', paths.getDataConfigDir());

  // Summary completo
  script.logger.info(paths.getSummary());
});
```

### AWS Lambda Esempio

```typescript
// handler.ts
import { Core } from '@go-automation/go-common';

// Configura per Lambda
process.env.GO_DEPLOYMENT_MODE = 'standalone';
process.env.GO_BASE_DIR = '/tmp';

export const handler = async (event: unknown) => {
  const script = new Core.GOScript({
    metadata: {
      name: 'Lambda Handler',
      version: '1.0.0',
      description: 'Lambda function handler',
    },
    config: {
      parameters: [
        // Parametri caricati da event invece che CLI
      ],
    },
  });

  // I path saranno risolti relativi a /tmp
  const paths = new Core.GOPaths('lambda-handler');
  console.log('Data dir:', paths.getDataDir());
  // Output: /tmp/data

  // ... logica Lambda
};
```

### Backward Compatibility

- **Nessuna modifica richiesta** per script esistenti nel monorepo
- Le nuove variabili d'ambiente sono **opzionali**
- Il rilevamento automatico funziona nella maggior parte dei casi
- Usa `GO_DEPLOYMENT_MODE` solo quando necessario forzare una modalità

---

## Troubleshooting

### Errore: "Cannot find module '@go-automation/go-common'"

**Causa**: go-common non e stato buildato.

**Soluzione**:

```bash
pnpm build:common
```

### Errore: "TS2307: Cannot find module './libs/MyService.js'"

**Causa**: Manca l'estensione `.js` nell'import (richiesta da ESM).

**Soluzione**:

```typescript
// CORRETTO
import { MyService } from './libs/MyService.js';

// SBAGLIATO
import { MyService } from './libs/MyService';
```

### Errore: Build fallisce con "composite project must..."

**Causa**: Configurazione tsconfig non corretta.

**Soluzione**: Verifica che `tsconfig.json` abbia:

```json
{
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist",
    "rootDir": "./src"
  }
}
```

### Errore: "workspace:\* dependency not found"

**Causa**: pnpm non ha installato le dipendenze workspace.

**Soluzione**:

```bash
# Dalla root
pnpm install
```

### Script non trova i file di configurazione

**Causa**: Il working directory e diverso dalla directory dello script.

**Soluzione**: Esegui sempre dalla root del monorepo:

```bash
# CORRETTO (dalla root)
pnpm --filter=go-my-script dev

# SBAGLIATO (dalla directory dello script)
cd scripts/go/go-my-script && pnpm dev
```

### AWS SSO login richiesto ripetutamente

**Causa**: Le credenziali SSO sono scadute.

**Soluzione**:

```bash
# Login manuale
aws sso login --profile nome-profilo

# Oppure lascia che GOScript gestisca automaticamente
# (richiede ambiente interattivo)
```

### Errore: "Parameter 'X' is missing"

**Causa**: Parametro required non fornito.

**Soluzione**:

1. Passa il parametro via CLI: `--param-name value`
2. Definiscilo in `configs/config.json` o `configs/config.yaml`
3. Impostalo come variabile d'ambiente

### noUncheckedIndexedAccess causa troppi errori

**Causa**: Accesso a indici array senza controlli.

**Soluzione**:

```typescript
// Opzione 1: Controllo esplicito
if (items.length > 0) {
  const first = items[0]!;
}

// Opzione 2: Optional chaining
const first = items[0];
if (first !== undefined) {
  // usa first
}

// Opzione 3: at() con fallback
const first = items.at(0) ?? defaultValue;
```

---

## Riferimenti

- [CLAUDE.md](../CLAUDE.md) - Coding standards completi
- [pnpm Workspaces](https://pnpm.io/workspaces)
- [TypeScript Project References](https://www.typescriptlang.org/docs/handbook/project-references.html)
- [Google TypeScript Style Guide](https://ts.dev/style/)

---

**Ultima modifica**: 2026-01-22
**Maintainer**: Team GO - Gestione Operativa
