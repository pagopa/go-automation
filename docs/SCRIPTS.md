# Scripts - Guida Completa

> Tutto quello che serve sapere per sviluppare, mantenere e deployare script nel monorepo GO Automation.

## Indice

1. [Introduzione](#introduzione)
2. [Anatomia di uno Script](#anatomia-di-uno-script)
3. [Creare un Nuovo Script](#creare-un-nuovo-script)
4. [Convenzioni e Standard](#convenzioni-e-standard)
5. [Quality Gates: i Check Automatici](#quality-gates-i-check-automatici)
6. [Documentazione degli Script](#documentazione-degli-script)
7. [Da Script a Lambda](#da-script-a-lambda)
8. [esbuild in Dettaglio](#esbuild-in-dettaglio)
9. [Deployment](#deployment)
10. [Toolchain: Strumenti e Configurazione](#toolchain-strumenti-e-configurazione)
11. [Riferimenti e Link Utili](#riferimenti-e-link-utili)

---

## Introduzione

### Cos'è uno Script in GO Automation?

Uno **script** è un programma TypeScript autonomo che esegue un compito specifico: analizzare allarmi CloudWatch, importare notifiche da CSV, interrogare tabelle DynamoDB, monitorare code SQS. Ogni script vive dentro il monorepo `go-automation` ed è un progetto npm a sé stante, con il proprio `package.json`, `tsconfig.json` e struttura di directory.

Gli script non partono da zero. Si appoggiano su **`@go-automation/go-common`**, la libreria condivisa del monorepo che fornisce:

- **GOScript** — il framework che gestisce il ciclo di vita (avvio, configurazione, cleanup, signal handling)
- **GOLogger** — logging strutturato su console e file
- **GOPrompt** — spinner, barre di progresso, input interattivo
- **GOConfigReader** — parsing di parametri CLI, file YAML/JSON, variabili d'ambiente
- **Importers/Exporters** — lettura e scrittura di CSV, JSON, JSONL, HTML
- **GOPaths** — risoluzione intelligente dei percorsi (monorepo vs standalone)
- **AWS utilities** — gestione credenziali SSO, client pre-configurati
- **SEND SDK** — client per le API di notifica digitale SEND

Questo significa che lo sviluppatore si concentra sulla **business logic** — tutto il "plumbing" è già fatto.

### A Chi è Rivolta Questa Guida

Questa guida è pensata per:

- **Chi inizia da zero** e vuole capire come funziona il progetto prima di scrivere codice
- **Chi deve creare il primo script** e vuole seguire un percorso chiaro dall'idea al deploy
- **Chi lavora già nel monorepo** e cerca un riferimento rapido su convenzioni, tool e processi

La guida segue un filo narrativo: si parte dalla comprensione della struttura, si passa alla creazione pratica, si approfondiscono convenzioni e strumenti, e si arriva fino al deployment su AWS Lambda. Ogni sezione è pensata per essere leggibile anche in modo indipendente.

---

## Anatomia di uno Script

### La Struttura a 3 File

Ogni script nel monorepo segue un pattern chiamato **struttura a 3 file**. L'idea è semplice: separare le responsabilità in modo che ogni file abbia un ruolo chiaro è unico.

```
my-script/
├── src/
│   ├── index.ts       # 1. Entry point — solo wiring
│   ├── config.ts      # 2. Configurazione — metadata e parametri
│   ├── main.ts        # 3. Business logic — il cuore dello script
│   ├── libs/          # Helper functions e servizi estratti da main
│   └── types/         # Type definitions (un file per tipo)
├── configs/           # File di configurazione (JSON, YAML)
├── data/              # Dati locali (gitignored)
├── package.json
├── tsconfig.json
└── README.md
```

Vediamo ogni file in dettaglio.

#### `index.ts` — Entry Point Minimale

Il file `index.ts` ha il solo compito di **collegare i pezzi**: importa la configurazione, crea l'istanza `GOScript`, e lancia la funzione `main()`. Non contiene logica di business.

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

Perché è così minimale? Perché `GOScript.run()` gestisce automaticamente:

- Il parsing dei parametri CLI
- Il caricamento della configurazione da file e variabili d'ambiente
- La registrazione degli signal handler (SIGTERM, SIGINT, SIGQUIT)
- Il cleanup automatico alla fine dell'esecuzione

#### `config.ts` — Configurazione

Il file `config.ts` centralizza **cosa** lo script si aspetta dal mondo esterno:

- **`scriptMetadata`** — nome, versione, descrizione, autori
- **`scriptParameters`** — definizione dei parametri CLI (tipo, obbligatorietà, alias, valori di default)

```typescript
import { Core } from '@go-automation/go-common';

export const scriptMetadata: Core.GOScriptMetadata = {
  name: 'GO Report Alarms',
  version: '1.0.0',
  description: 'Analizza e genera report degli allarmi CloudWatch',
  authors: ['Team GO - Gestione Operativa'],
};

export const scriptParameters: ReadonlyArray<Core.GOConfigParameterOptions> = [
  {
    name: 'aws.profile',
    type: Core.GOConfigParameterType.STRING,
    description: 'AWS SSO profile name',
    required: true,
    aliases: ['ap'],
  },
  {
    name: 'days',
    type: Core.GOConfigParameterType.NUMBER,
    description: 'Number of days to analyze',
    required: false,
    defaultValue: 7,
    aliases: ['d'],
  },
] as const;
```

**Regola importante**: `config.ts` non definisce interfacce. La config interface vive in `types/`.

#### `main.ts` — Business Logic

Il file `main.ts` contiene la logica di business dello script. Esporta una singola funzione `main()`:

```typescript
import { Core } from '@go-automation/go-common';

import type { ReportAlarmsConfig } from './types/index.js';

export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<ReportAlarmsConfig>();

  script.logger.section('Fetching alarms');
  // ... business logic ...
}
```

**Regola critica**: `main.ts` deve contenere **solo** la funzione `main()`. Nessuna altra funzione, nessun helper. Se serve logica aggiuntiva, va estratta in file separati dentro `libs/`. Questa regola è enforced da ESLint (vedi [Quality Gates](#quality-gates-i-check-automatici)).

#### `libs/` — Helper Functions

La directory `libs/` contiene funzioni helper estratte da `main.ts` per mantenere il file principale pulito e sotto i limiti di complessità. Ogni file ha una responsabilità specifica:

```
libs/
├── fetchAlarms.ts        # Recupero dati da AWS
├── displayResults.ts     # Visualizzazione risultati
├── saveExecutionTrace.ts # Salvataggio trace di esecuzione
└── computeTimeRange.ts   # Calcolo intervallo temporale
```

Ogni file in `libs/` esporta funzioni con **named export**, documenta con JSDoc, e riceve le dipendenze come parametri (non le importa globalmente).

#### `types/` — Type Definitions

La directory `types/` contiene le definizioni dei tipi. La regola è: **un file per ogni type/interface**, con naming PascalCase.

```
types/
├── ReportAlarmsConfig.ts  # Interface di configurazione
├── AlarmSummary.ts        # Tipo per i risultati
└── index.ts               # Barrel file per re-export
```

Il barrel file `index.ts` re-esporta tutti i tipi per semplificare gli import:

```typescript
export type { ReportAlarmsConfig } from './ReportAlarmsConfig.js';
export type { AlarmSummary } from './AlarmSummary.js';
```

### Flusso di Esecuzione

Quando lanci uno script, il flusso di esecuzione è il seguente:

```
Utente lancia lo script
         │
         ▼
┌─────────────────────────┐
│      index.ts           │  Crea GOScript, chiama script.run()
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│   GOScript.run()        │  1. Registra signal handlers (SIGTERM, SIGINT)
│                         │  2. Carica configurazione (CLI + file + env)
│                         │  3. Inizializza logger (console + file)
│                         │  4. Mostra header con metadata
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│      main(script)       │  Business logic: usa script.logger,
│                         │  script.prompt, script.aws, ...
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│   Cleanup automatico    │  Chiude file handles, spinner,
│                         │  rilascia risorse AWS
└─────────────────────────┘
```

### Perché Questa Architettura

| Principio                            | Come si applica                                                 |
| ------------------------------------ | --------------------------------------------------------------- |
| **Separazione delle responsabilità** | Ogni file ha un ruolo specifico e non si sovrappone             |
| **Testabilità**                      | `main.ts` può essere testato passando un mock di `GOScript`     |
| **Riutilizzo**                       | La config può essere importata da Lambda handler o altri moduli |
| **Manutenibilità**                   | Modifiche isolate: cambiare un parametro tocca solo `config.ts` |
| **Leggibilità**                      | Chi arriva nuovo capisce subito dove cercare cosa               |

---

## Creare un Nuovo Script

### Creazione Rapida con lo Scaffolding Tool (Raccomandato)

Il modo più veloce e sicuro per creare uno script è usare il tool di scaffolding interattivo:

```bash
./bins/create-script.sh
```

Lo script ti guida attraverso un wizard con menu a frecce:

1. **Selezione del prodotto** — GO, SEND, o INTEROP
2. **Nome dello script** — nel formato `verbo-descrizione` (es. `report-metrics`, `import-data`)
3. **Descrizione** — una breve descrizione dello scopo dello script
4. **Parametro AWS** — se lo script interagirà con AWS, aggiunge automaticamente `--aws-profile`
5. **Shortcuts** — opzionalmente aggiunge comandi rapidi al `package.json` root

Il tool genera:

| File generato           | Contenuto                        |
| ----------------------- | -------------------------------- |
| `src/index.ts`          | Entry point con wiring GOScript  |
| `src/config.ts`         | Metadata e parametri             |
| `src/main.ts`           | Template business logic          |
| `src/types/{Config}.ts` | Interface di configurazione      |
| `src/types/index.ts`    | Barrel file                      |
| `package.json`          | Manifest con dipendenze corrette |
| `tsconfig.json`         | Configurazione TypeScript        |
| `README.md`             | Documentazione dello script      |

Dopo la creazione, esegue automaticamente `pnpm install` e verifica il build.

### Il Nome dello Script: Convenzione `prodotto-verbo-descrizione`

Il nome finale dello script segue il pattern: `{prodotto}-{verbo}-{descrizione}`.

- **Prodotto**: `go-`, `send-`, `interop-`
- **Verbo**: un'azione chiara (vedi tabella in [ARCHITECTURE.md](ARCHITECTURE.md))
- **Descrizione**: l'oggetto dell'azione

Esempi: `go-report-alarms`, `send-import-notifications`, `send-dump-sqs`, `go-parse-json`.

Il nome determina anche lo shortcut pnpm: `go-report-alarms` diventa `go:report:alarms:dev`.

### Creazione Manuale Passo-Passo

Se preferisci creare lo script manualmente (utile per capire ogni pezzo):

#### Passo 1: Crea la directory

```bash
mkdir -p scripts/go/go-my-script/src/{libs,types}
mkdir -p scripts/go/go-my-script/{configs,data}
```

#### Passo 2: Crea `package.json`

```json
{
  "name": "go-my-script",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "Descrizione dello script",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "pnpm build && node dist/index.js",
    "dev": "tsx src/index.ts",
    "watch": "tsc --watch",
    "clean": "rm -rf dist *.tsbuildinfo"
  },
  "dependencies": {
    "@go-automation/go-common": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^24.10.9"
  }
}
```

Punti chiave:

- **`"type": "module"`** — abilita ESM (ECMAScript Modules)
- **`"workspace:*"`** — usa la versione locale di go-common, non quella da npm
- **`"private": true`** — impedisce la pubblicazione accidentale su npm
- **`"main": "dist/index.js"`** — entry point compilato

#### Passo 3: Crea `tsconfig.json`

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

- **`extends`** — eredita strict mode completo da `tsconfig.base.json`
- **`composite: true`** — abilita project references per build incrementali
- **`references`** — dichiara la dipendenza da go-common

#### Passo 4: Crea i 3 file + types

Segui la struttura descritta in [Anatomia di uno Script](#la-struttura-a-3-file). I template generati dallo scaffolding tool sono un ottimo punto di partenza.

#### Passo 5: Install e Build

```bash
# Dalla root del monorepo
pnpm install

# Build go-common (se non già fatto)
pnpm build:common

# Build dello script
pnpm --filter=go-my-script build
```

#### Passo 6: Primo Run

```bash
# Dev mode (esegue TypeScript direttamente con tsx)
pnpm --filter=go-my-script dev -- --help

# Production mode (build + esecuzione del JS compilato)
pnpm --filter=go-my-script start -- --aws-profile sso_pn-core-dev
```

### Dopo la Creazione: Checklist

- [ ] Aggiungi i parametri in `config.ts`
- [ ] Definisci la config interface in `types/`
- [ ] Implementa la logica in `main.ts`
- [ ] Estrai helper in `libs/` se `main.ts` cresce
- [ ] Verifica il build: `pnpm --filter=go-my-script build`
- [ ] Verifica il lint: `pnpm lint`
- [ ] Scrivi il README seguendo il [template](README-TEMPLATE.md)

---

## Convenzioni e Standard

### Naming Conventions

#### File e Directory

| Tipo             | Convenzione | Esempio                                    |
| ---------------- | ----------- | ------------------------------------------ |
| Directory script | kebab-case  | `go-report-alarms/`                        |
| File in `libs/`  | camelCase   | `fetchAlarms.ts`, `displayResults.ts`      |
| File in `types/` | PascalCase  | `ReportAlarmsConfig.ts`, `AlarmSummary.ts` |
| File entry point | lowercase   | `index.ts`, `config.ts`, `main.ts`         |
| File di config   | lowercase   | `config.json`, `config.yaml`               |

#### Codice TypeScript

| Identificatore                 | Convenzione      | Esempio                              |
| ------------------------------ | ---------------- | ------------------------------------ |
| Classi, Interface, Tipi        | `UpperCamelCase` | `AlarmAnalyzer`, `FilteredAlarms`    |
| Variabili, Funzioni, Parametri | `lowerCamelCase` | `alarmCount`, `processData`          |
| Costanti                       | `CONSTANT_CASE`  | `MAX_RETRIES`, `BASE_EXPORT_COLUMNS` |
| Campi privati                  | `lowerCamelCase` | `private items` (NON `_items`)       |

Le abbreviazioni si trattano come parole normali: `loadHttpUrl()`, non `loadHTTPURL()`.

### Import e Moduli ESM

Il progetto usa **ESM** (ECMAScript Modules). Gli import devono **sempre** includere l'estensione `.js`, anche se il file sorgente è `.ts`:

```typescript
// CORRETTO
import { main } from './main.js';
import type { MyConfig } from './types/index.js';

// SBAGLIATO — genera ERR_MODULE_NOT_FOUND a runtime
import { main } from './main';
```

Altre regole:

- **Sempre named export**, mai default export
- **`import type`** per importare solo tipi (tree-shaking friendly)
- **`import * as`** per namespace grandi (es. `import * as fs from 'fs/promises'`)

### Organizzazione del Codice

#### Un tipo per file

Ogni interface o type alias va nel suo file dedicato in `types/`, con naming PascalCase:

```
// CORRETTO
types/UserConfig.ts      → export interface UserConfig { ... }
types/ProcessResult.ts   → export interface ProcessResult { ... }

// SBAGLIATO
types/types.ts           → export interface UserConfig { ... }
                            export interface ProcessResult { ... }
```

#### La config interface va in `types/`, non in `config.ts`

Il file `config.ts` esporta solo `scriptMetadata` e `scriptParameters`. La interface di configurazione (es. `ReportAlarmsConfig`) vive in `types/` e viene importata da `main.ts` con `import type`:

```typescript
// main.ts
import type { ReportAlarmsConfig } from './types/index.js';
```

Questa separazione è enforced dallo [Scaffold Validator](#scaffold-validation-engine).

#### Helper in `libs/`, non in `main.ts`

Se la logica in `main.ts` cresce, estrai le funzioni helper in file dedicati dentro `libs/`. Ogni file in `libs/` ha una responsabilità specifica:

```
libs/
├── fetchAlarms.ts       # Interazione con AWS
├── displayResults.ts    # Formattazione e visualizzazione output
├── computeTimeRange.ts  # Calcolo date
└── saveExecutionTrace.ts # Persistenza trace
```

Le regole ESLint per `main.ts` impongono:

- **max 200 righe** (escludendo commenti e righe vuote)
- **max 80 righe per funzione** (escludendo commenti e righe vuote)
- **max 15 di complessità ciclomatica**
- **nessuna funzione oltre a `main()`**

### Quando Spostare Codice in go-common

Una domanda frequente: "Ho scritto una utility nel mio script. Devo spostarla in go-common?"

La risposta è: **sì, se può essere utile ad almeno un altro script**.

#### Segnali che il codice va in go-common

- La funzionalità è **generica** (non legata a un dominio specifico)
- Un altro script sta per **duplicare** la stessa logica
- Si tratta di un **pattern ricorrente** (retry, formatting, parsing)
- Interagisce con un **servizio AWS** in modo riutilizzabile

#### Come procedere

1. Implementa prima nello script — testa e valida
2. Quando diventa chiaro che è riutilizzabile, spostala in `go-common`
3. Esporta dal namespace appropriato (`Core`, `SEND`, `AWS`)
4. Aggiorna gli script che la usano per importare da go-common
5. Documenta in [GOCOMMON.md](GOCOMMON.md)

#### Regole ESLint che lo enforceranno

Se provi a usare una libreria di terze parti al posto delle utilities di go-common, ESLint ti bloccherà. Le regole `no-restricted-imports` e `no-restricted-syntax` impediscono di:

- Importare `yargs`, `commander`, `minimist` → usa `GOConfigReader`
- Importare `winston`, `bunyan`, `pino` → usa `GOLogger`
- Importare `ora`, `cli-spinners` → usa `GOPrompt`
- Importare `csv-parse`, `csv-writer` direttamente → usa `GOCSVListImporter` / `GOCSVListExporter`
- Importare `node-fetch`, `axios`, `got` → usa `GOHttpClient`
- Usare `new EventEmitter()` direttamente → estendi `GOEventEmitterBase`

La lista completa è in [CONVENTIONS.md](CONVENTIONS.md).

---

## Quality Gates: i Check Automatici

La qualità del codice in GO Automation non è affidata solo alla code review. Una **pipeline CI** con 8 check paralleli protegge il repository da regressioni.

### La CI Pipeline

Ogni push su `main`/`develop` e ogni Pull Request esegue questi check:

```
┌─────────────┐  ┌───────┐  ┌──────────┐  ┌──────┐
│  Type Check  │  │ Lint  │  │  Format  │  │ Knip │
└──────┬───────┘  └───┬───┘  └─────┬────┘  └──┬───┘
       │              │            │           │
┌──────┴───────┐  ┌───┴───┐  ┌────┴────┐  ┌───┴──────┐
│  Scaffold    │  │ Build │  │  Test   │  │ Coverage │
└──────────────┘  └───────┘  └─────────┘  └──────────┘
                       │
                       ▼
              ┌─────────────────┐
              │   CI Success    │  Tutti devono passare
              └─────────────────┘
```

| Check          | Comando             | Cosa verifica                        |
| -------------- | ------------------- | ------------------------------------ |
| **Type Check** | `tsc --noEmit`      | Compilazione TypeScript senza errori |
| **Lint**       | `eslint`            | Regole di qualità del codice         |
| **Format**     | `prettier --check`  | Formattazione uniforme               |
| **Knip**       | `knip`              | Codice e export inutilizzati         |
| **Scaffold**   | `validate:scaffold` | Struttura corretta degli script      |
| **Build**      | `tsc`               | Compilazione produce output valido   |
| **Test**       | `vitest`            | Test unitari passano                 |
| **Coverage**   | `vitest --coverage` | Copertura >= 90% linee, 80% branch   |

**Tutti e 8 i check devono passare** perché la PR possa essere mergiata.

### ESLint: Regole Custom

Oltre alle regole standard (TypeScript strict, import ordering, security), il progetto definisce regole specifiche.

#### Pacchetti Vietati (`no-restricted-imports`)

ESLint impedisce l'import di pacchetti che hanno un equivalente in go-common:

| Pacchetto vietato                                    | Alternativa go-common                     |
| ---------------------------------------------------- | ----------------------------------------- |
| `yargs`, `commander`, `minimist`, `meow`             | `GOConfigReader`                          |
| `winston`, `bunyan`, `pino`, `log4js`                | `GOLogger`                                |
| `ora`, `cli-spinners`                                | `GOPrompt`                                |
| `node-fetch`, `axios`, `got`, `undici`, `superagent` | `GOHttpClient`                            |
| `csv-parse`, `csv-writer`, `papaparse`, `fast-csv`   | `GOCSVListImporter` / `GOCSVListExporter` |

#### Pattern di Codice Vietati (`no-restricted-syntax`)

| Pattern vietato            | Messaggio                                 |
| -------------------------- | ----------------------------------------- |
| `new EventEmitter()`       | Estendi `GOEventEmitterBase` da go-common |
| `process.env[...]` diretto | Usa `GOConfigEnvProvider`                 |
| `fs.readFileSync(...)`     | Usa `fs/promises` per async I/O           |

### La Regola `main.ts`

Un set dedicato di regole si applica **solo** ai file `scripts/**/src/main.ts`:

| Regola                       | Livello | Limite        | Perché                                    |
| ---------------------------- | ------- | ------------- | ----------------------------------------- |
| `no-extra-functions-in-main` | `error` | Solo `main()` | Helper vanno in `libs/`                   |
| `max-lines`                  | `error` | 200 righe     | File troppo lungo → ha helper da estrarre |
| `max-lines-per-function`     | `error` | 80 righe      | Funzione troppo grande → split in `libs/` |
| `complexity`                 | `error` | 15            | Troppi branch → logica da semplificare    |

La regola `no-extra-functions-in-main` è una **regola ESLint custom** definita inline in `eslint.config.mjs`. Verifica che nel file `main.ts` esista solo la funzione `main()` — qualsiasi altra function declaration o arrow function assegnata causa errore.

### Scaffold Validation Engine

Il **Scaffold Validator** (`bins/validate-scaffold/`) verifica che ogni script rispetti la struttura standard. Controlla:

**Struttura file:**

- `src/index.ts`, `src/config.ts`, `src/main.ts` esistono
- Almeno un file `*Config.ts` esiste in `src/types/`
- Il barrel file `src/types/index.ts` esiste

**Contenuto `config.ts`:**

- Esporta `scriptMetadata` e `scriptParameters`
- NON definisce interfacce (devono stare in `types/`)
- NON re-esporta tipi config

**Contenuto `index.ts`:**

- Importa da `@go-automation/go-common`
- Importa da `./config.js` e `./main.js`

**Contenuto `main.ts`:**

- Esporta `async function main`
- NON importa la config type da `./config.js` (deve importarla da `./types/`)

**`package.json`:**

- `private: true`, `type: "module"`, `main: "dist/index.js"`
- Dipende da `@go-automation/go-common` con `workspace:*`
- Ha gli script `build`, `start`, `dev`, `watch`, `clean`

**`tsconfig.json`:**

- Estende `tsconfig.base.json`
- Ha `composite: true`
- Referenzia `go-common`

```bash
# Eseguilo localmente per verificare
pnpm validate:scaffold
```

### Knip: Rilevamento Codice Inutilizzato

[Knip](https://knip.dev/) analizza il progetto e segnala:

- **Export inutilizzati** — funzioni/tipi esportati ma mai importati da nessuno
- **Dipendenze inutilizzate** — pacchetti in `package.json` mai importati nel codice
- **File orfani** — file TypeScript che nessun altro file importa

Regola pratica: se una funzione o un tipo è usato **solo internamente** al suo file, non esportarlo. L'`export` keyword segnala "questo è pubblico e qualcun altro lo usa". Se Knip lo segnala come unused, probabilmente dovresti rimuovere l'export.

```bash
pnpm knip
```

### Prettier: Formattazione Automatica

Prettier è configurato come ultima regola ESLint (override) per garantire formattazione uniforme. Non serve pensarci: configura il tuo editor per formattare al salvataggio.

```bash
# Verifica (non modifica i file)
pnpm format:check

# Correggi automaticamente
pnpm format
```

---

## Documentazione degli Script

### Il README di Ogni Script

Ogni script deve avere un `README.md` nella sua root. Il file viene generato automaticamente dallo scaffolding tool a partire dal template in `bins/script-templates/README.md.template`, e segue la struttura definita in [README-TEMPLATE.md](README-TEMPLATE.md).

Un buon README contiene:

| Sezione                  | Contenuto                                                        |
| ------------------------ | ---------------------------------------------------------------- |
| **Titolo e descrizione** | Cosa fa lo script, in una frase                                  |
| **Prerequisiti**         | AWS profile, file di input, configurazioni necessarie            |
| **Utilizzo**             | Comandi per dev mode e production mode                           |
| **Parametri**            | Tabella con tutti i parametri CLI, tipo, default, obbligatorietà |
| **Configurazione**       | Come configurare via file YAML/JSON                              |
| **Output**               | Cosa produce lo script (file, report, console output)            |
| **Esempi**               | Casi d'uso concreti con comandi completi                         |

### JSDoc sulle Funzioni Pubbliche

Tutte le funzioni esportate devono avere **documentazione JSDoc completa**:

````typescript
/**
 * Fetches alarm history from CloudWatch for the given AWS profiles.
 *
 * Queries each profile in parallel and merges the results into
 * a single sorted array.
 *
 * @param profiles - AWS profile names to query
 * @param timeRange - Start and end dates for the query window
 * @param client - Pre-configured CloudWatch client
 * @returns Merged and sorted alarm history items
 *
 * @example
 * ```typescript
 * const alarms = await fetchAlarms(['dev', 'prod'], timeRange, client);
 * console.log(`Found ${alarms.length} alarms`);
 * ```
 */
export async function fetchAlarms(
  profiles: ReadonlyArray<string>,
  timeRange: TimeRange,
  client: CloudWatchClient,
): Promise<ReadonlyArray<AlarmHistoryItem>> {
  // ...
}
````

### Il File Header Comment

Ogni file TypeScript inizia con un commento JSDoc che descrive lo scopo del modulo:

```typescript
/**
 * Display helpers for import workflow results.
 */
```

Per i 3 file principali il pattern è:

```typescript
// index.ts
/**
 * Script Name - Entry Point
 *
 * Minimal entry point that wires together:
 * - GOScript instantiation with metadata and parameters
 * - Configuration loading and validation
 * - Main business logic execution
 */

// config.ts
/**
 * Script Name - Configuration Module
 *
 * Contains script metadata and parameters definition.
 */

// main.ts
/**
 * Script Name - Main Logic Module
 *
 * Contains the core business logic for [descrizione].
 * Receives typed dependencies (script) for clean separation of concerns.
 */
```

### Quando Aggiornare la Documentazione

- **Aggiungi un parametro** → aggiorna la tabella parametri nel README
- **Cambi il comportamento** → aggiorna la descrizione e gli esempi
- **Estrai una funzione in libs/** → aggiungi JSDoc alla nuova funzione
- **Crei un nuovo tipo in types/** → aggiungi JSDoc all'interface

---

## Da Script a Lambda

### Cos'è una Lambda e Quando Usarla

AWS Lambda è un servizio serverless che esegue codice in risposta a eventi. Nel contesto di GO Automation, una Lambda è utile quando:

- Lo script deve essere eseguito **su schedule** (es. ogni ora, ogni giorno)
- Non serve interazione utente (no prompt, no input CLI)
- L'esecuzione deve avvenire in **ambiente AWS** (con accesso a risorse interne)
- Si vuole evitare la gestione di un container always-on

La buona notizia: **non devi riscrivere lo script**. Il framework GOScript fornisce `createLambdaHandler()`, che wrappa la stessa funzione `main()` usata in modalità CLI.

### Il Pattern `createLambdaHandler()`

Il cuore dell'integrazione Lambda è il riutilizzo della business logic. Lo script CLI e la Lambda condividono lo stesso `main()`:

```
┌──────────────────────────────────────────────────────┐
│                  Script CLI (index.ts)                │
│                                                      │
│  GOScript → run() → main(script)                     │
│  Config: CLI args + file + env                       │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│              Lambda Handler (handler.ts)              │
│                                                      │
│  GOScript → createLambdaHandler() → main(script)     │
│  Config: env vars + event payload                    │
└──────────────────────────────────────────────────────┘

Entrambi chiamano la stessa main() — zero duplicazione.
```

### Struttura della Directory `functions/`

Le Lambda vivono in una directory dedicata `functions/` nella root del monorepo:

```
functions/
└── go-SendMonitorTppMessagesLambda/
    ├── src/
    │   ├── handler.ts       # Lambda handler
    │   └── test-local.ts    # Test locale
    ├── esbuild.config.mjs   # Configurazione bundling
    ├── package.json
    └── tsconfig.json
```

### Esempio Reale: handler.ts

```typescript
import type { ScheduledEvent } from 'aws-lambda';
import { Core, AWS } from '@go-automation/go-common';
import { scriptMetadata, scriptParameters } from 'send-monitor-tpp-messages/config';
import { main } from 'send-monitor-tpp-messages/main';

// GOScript istanziato a scope di modulo per container reuse
const script = new Core.GOScript({
  metadata: scriptMetadata,
  config: { parameters: scriptParameters },
});

// Handler Lambda
export const handler = script.createLambdaHandler<ScheduledEvent>(async (_event) => {
  await main(script);

  // Post-execution: upload report su S3
  const reportsBucket = process.env['REPORTS_S3_BUCKET'];
  if (reportsBucket) {
    const s3Service = new AWS.AWSS3Service(new S3Client({}));
    const uploaded = await s3Service.uploadDirectory(reportsDir, reportsBucket, prefix);
    // ...
  }
});
```

Punti chiave:

- **Importa `config` e `main` dallo script originale** — nessuna duplicazione
- **`createLambdaHandler()`** gestisce il lifecycle Lambda (init, invoke, error handling)
- **GOScript è istanziato fuori dall'handler** per sfruttare il container reuse di Lambda
- **La configurazione arriva dalle env vars** (`GOEnvironmentConfigProvider`) e dall'event payload (`GOLambdaEventConfigProvider`), non da CLI args
- **Credenziali AWS** vengono dal execution role IAM (no SSO)

### Configurazione via Environment Variables

In Lambda, i parametri CLI vengono mappati a variabili d'ambiente. La conversione segue la regola: `dot.notation` → `SCREAMING_SNAKE_CASE`.

| Parametro CLI     | Variabile d'ambiente |
| ----------------- | -------------------- |
| `slack.token`     | `SLACK_TOKEN`        |
| `start.date`      | `START_DATE`         |
| `athena.database` | `ATHENA_DATABASE`    |

Per parametri sensibili (come token), la Lambda li riceve da AWS Secrets Manager o direttamente come env var criptata.

---

## esbuild in Dettaglio

### Il Problema: Bundling per Lambda

Quando deployi su Lambda, devi fornire un **singolo artefatto** (zip o directory) che contiene tutto il codice necessario. In un monorepo con workspace dependencies, questo è un problema:

- Lo script importa da `@go-automation/go-common` (workspace dependency)
- `go-common` importa da `@aws-sdk/*`, `csv-parse`, `yaml`, ecc.
- Lambda ha un limite di 250 MB per il package
- I `node_modules` con le dipendenze transitive possono essere enormi

La soluzione standard sarebbe usare `pnpm deploy` (come per Docker), ma per Lambda serve un approccio più aggressivo: **bundling**.

### Cos'è esbuild

[esbuild](https://esbuild.github.io/) è un bundler JavaScript/TypeScript scritto in Go. Prende uno o più file di ingresso e produce un singolo file di output che contiene tutto il codice necessario, con le dipendenze "inline".

### Perché esbuild e Non Altre Alternative

| Tool        | Velocità                 | Tree-shaking | TypeScript nativo | Configurazione |
| ----------- | ------------------------ | ------------ | ----------------- | -------------- |
| **esbuild** | Estremamente veloce (Go) | Sì           | Sì                | Minimale       |
| webpack     | Lento                    | Sì           | Con loader        | Complessa      |
| rollup      | Medio                    | Eccellente   | Con plugin        | Media          |
| tsc         | N/A (non bundla)         | No           | Sì                | -              |

esbuild è stato scelto perché:

1. **Velocità** — ordini di grandezza più veloce di webpack (scritto in Go, non in JS)
2. **Semplicità** — la configurazione è un singolo file con poche opzioni
3. **TypeScript nativo** — non servono loader o plugin aggiuntivi
4. **Output pulito** — genera codice leggibile (non minificato, per debug in Lambda)
5. **Tree-shaking** — include solo il codice effettivamente usato

### Anatomia di `esbuild.config.mjs`

Ecco la configurazione completa usata per la Lambda:

```javascript
import * as esbuild from 'esbuild';
import * as fs from 'fs/promises';
import * as path from 'path';

const MONOREPO_ROOT = path.resolve('..', '..');
const ARTIFACT_DIR = path.join(MONOREPO_ROOT, 'artifacts', 'go-SendMonitorTppMessagesLambda');

// Pulisci e ricrea la directory artifact
await fs.rm(ARTIFACT_DIR, { recursive: true, force: true });
await fs.mkdir(ARTIFACT_DIR, { recursive: true });

// Bundle con esbuild
await esbuild.build({
  entryPoints: ['src/handler.ts'], // File di ingresso
  bundle: true, // Inline tutte le dipendenze
  platform: 'node', // Target Node.js (non browser)
  target: 'node20', // Versione Node.js di Lambda
  outfile: path.join(ARTIFACT_DIR, 'handler.mjs'), // Output singolo file
  format: 'esm', // ECMAScript Modules
  sourcemap: true, // Source map per debug
  minify: false, // NON minificare (debug friendly)
  external: ['@aws-sdk/*'], // Escludi AWS SDK (già in Lambda)
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
});

// Copia configs accanto al bundle
await fs.cp(CONFIGS_SOURCE, CONFIGS_DEST, { recursive: true });
```

Spieghiamo ogni opzione:

| Opzione                    | Valore               | Perché                                                                         |
| -------------------------- | -------------------- | ------------------------------------------------------------------------------ |
| `entryPoints`              | `['src/handler.ts']` | Punto di ingresso del bundle                                                   |
| `bundle: true`             | -                    | Inline tutte le dipendenze nel file di output                                  |
| `platform: 'node'`         | -                    | Genera codice per Node.js, non per browser                                     |
| `target: 'node20'`         | -                    | Usa feature di Node 20 (il runtime Lambda)                                     |
| `format: 'esm'`            | -                    | Output in formato ESM (`.mjs`)                                                 |
| `sourcemap: true`          | -                    | Genera source map per stack trace leggibili                                    |
| `minify: false`            | -                    | Mantieni il codice leggibile per debug                                         |
| `external: ['@aws-sdk/*']` | -                    | NON includere AWS SDK nel bundle — Lambda lo fornisce già                      |
| `banner`                   | `createRequire(...)` | Polyfill per `require()` in contesto ESM (necessario per alcuni pacchetti CJS) |

### Il Flusso: da Source a Artifact

```
src/handler.ts
      │
      │  esbuild --bundle
      │
      ▼
┌─────────────────────────────────────────────────┐
│  handler.ts importa:                             │
│  ├── send-monitor-tpp-messages/config            │
│  ├── send-monitor-tpp-messages/main              │
│  ├── @go-automation/go-common (Core, AWS, SEND)  │
│  ├── csv-parse, yaml, prompts, ...               │
│  └── (tutto viene inlined)                       │
│                                                  │
│  ESCLUSO:                                        │
│  └── @aws-sdk/* (già nel runtime Lambda)         │
└─────────────────────────────────────────────────┘
      │
      ▼
artifacts/go-SendMonitorTppMessagesLambda/
├── handler.mjs          # Singolo file con tutto il codice
├── handler.mjs.map      # Source map per debug
└── configs/             # File di configurazione copiati
```

Il risultato è un artefatto **leggero** (pochi MB) che può essere zippato e deployato su Lambda.

### Quando Usare esbuild vs `pnpm deploy`

| Scenario            | Strumento                      | Perché                                                 |
| ------------------- | ------------------------------ | ------------------------------------------------------ |
| **Lambda**          | esbuild                        | Singolo file, tree-shaking, niente node_modules        |
| **Docker / ECS**    | `pnpm deploy` (bins/deploy.sh) | Self-contained con node_modules completi               |
| **Sviluppo locale** | `tsx`                          | Esecuzione diretta TypeScript, nessun build necessario |

---

## Deployment

### Panoramica delle Modalità

Gli script supportano diverse modalità di deployment, gestite dal sistema `GODeploymentMode`:

```
┌──────────────────────────────────────────────────────────────────┐
│                      Modalità di Deployment                      │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────┐  ┌──────────┐  │
│  │  Monorepo   │  │ Standalone  │  │  Docker  │  │  Lambda  │  │
│  │  (locale)   │  │  (deploy)   │  │  (ECS)   │  │  (AWS)   │  │
│  └──────┬──────┘  └──────┬──────┘  └─────┬────┘  └─────┬────┘  │
│         │                │               │              │        │
│    pnpm dev         deploy.sh      build-image.sh   esbuild     │
│    pnpm start       → artifacts/   → Docker image   → bundle    │
│                                    → ECR push       → zip/S3    │
└──────────────────────────────────────────────────────────────────┘
```

### Monorepo Mode (Sviluppo Locale)

È la modalità predefinita. Lo script gira dentro il monorepo con accesso alle dipendenze workspace:

```bash
# Dev mode — tsx esegue TypeScript direttamente
pnpm --filter=go-report-alarms dev -- --aws-profile sso_pn-core-dev

# Production mode — build + node
pnpm --filter=go-report-alarms start -- --aws-profile sso_pn-core-dev
```

### Standalone Mode (Deploy su Server)

`bins/deploy.sh` usa `pnpm deploy` per creare un pacchetto autonomo in `artifacts/`:

```bash
# Interattivo (menu di selezione)
./bins/deploy.sh

# CLI (per CI/CD)
./bins/deploy.sh --prod --clean --script go-report-alarms
```

L'artefatto contiene `dist/`, `node_modules/` (solo production), e `configs/`. Può essere copiato ovunque e funziona con `node dist/index.js`.

### Docker Mode (ECS/Fargate)

`bins/build-image.sh` crea un'immagine Docker ottimizzata:

```bash
./bins/build-image.sh send-monitor-tpp-messages v1.2.0
```

Il flusso: `deploy.sh` → artifacts → `Dockerfile.runtime` → immagine Docker.

L'immagine supporta tre `RUN_MODE`:

- **`once`** — esecuzione singola (default)
- **`cron`** — scheduling con `croner` (libreria Node.js, no root necessario)
- **`shell`** — shell interattiva per debug

Per dettagli completi su Docker, compose, credenziali AWS, e Terraform, vedi [DEPLOY.md](DEPLOY.md).

### Lambda Mode

Usa esbuild per creare un bundle ottimizzato (vedi [sezione esbuild](#esbuild-in-dettaglio)).

### Rilevamento Automatico della Modalità

Il sistema rileva automaticamente in quale modalità sta girando:

```
1. Variabile GO_DEPLOYMENT_MODE impostata? → usa quella
   ↓
2. Trova pnpm-workspace.yaml risalendo dal cwd? → MONOREPO
   ↓
3. Trova package.json con "workspaces"? → MONOREPO
   ↓
4. Default → STANDALONE
```

Variabili d'ambiente per il controllo:

| Variabile            | Descrizione      | Esempio                   |
| -------------------- | ---------------- | ------------------------- |
| `GO_DEPLOYMENT_MODE` | Forza modalità   | `monorepo` o `standalone` |
| `GO_BASE_DIR`        | Base directory   | `/app`                    |
| `GO_DATA_DIR`        | Directory dati   | `/app/data`               |
| `GO_CONFIG_DIR`      | Directory config | `/app/configs`            |
| `GO_INPUT_DIR`       | Directory input  | `/app/data/inputs`        |
| `GO_OUTPUT_DIR`      | Directory output | `/app/data/outputs`       |

---

## Toolchain: Strumenti e Configurazione

Questa sezione raccoglie in un unico punto tutti gli strumenti usati nel progetto, il loro ruolo, e come sono configurati.

### pnpm (Package Manager)

**Cos'è**: Package manager per Node.js, alternativo a npm e yarn. Usa un global store con hard link per risparmiare spazio disco e garantire installazioni deterministiche.

**Perché è stato scelto**:

- **Workspace nativi** — supporto eccellente per monorepo con `workspace:*` protocol
- **Strict mode** — blocca l'accesso a dipendenze non dichiarate (phantom dependencies)
- **Efficienza disco** — ogni pacchetto viene scaricato una sola volta nel global store
- **Velocità** — install incrementali molto più veloci dopo la prima esecuzione
- **Determinismo** — il lockfile `pnpm-lock.yaml` garantisce build riproducibili

**Configurazione**: `pnpm-workspace.yaml`

```yaml
packages:
  - packages/* # Librerie condivise
  - scripts/go/* # Script team GO
  - scripts/send/* # Script team SEND
  - scripts/interop/* # Script team INTEROP
```

**Comandi principali**:

```bash
pnpm install                              # Installa dipendenze
pnpm build                                # Build tutti i package
pnpm build:common                         # Build solo go-common
pnpm --filter=go-report-alarms build      # Build specifico
pnpm --filter=go-report-alarms dev        # Esecuzione dev mode
pnpm -r --filter='./scripts/**' build     # Build tutti gli script
```

### TypeScript (Compilatore)

**Versione**: 5.9+ (con strict mode completo)

**Perché è stato scelto**: Type safety estrema, refactoring sicuro, documentazione implicita tramite tipi.

**Configurazione**: `tsconfig.base.json` definisce le regole base, ogni script lo estende.

Le opzioni strict più importanti:

| Opzione                      | Effetto                                                 |
| ---------------------------- | ------------------------------------------------------- |
| `strict: true`               | Abilita tutti i check strict                            |
| `noUncheckedIndexedAccess`   | `arr[0]` ha tipo `T \| undefined`                       |
| `exactOptionalPropertyTypes` | Proprietà opzionali richiedono `\| undefined` esplicito |
| `noImplicitAny`              | Nessun `any` implicito                                  |
| `noUnusedLocals`             | Variabili locali inutilizzate sono errore               |
| `noUnusedParameters`         | Parametri inutilizzati sono errore                      |

**Project References**: Ogni script dichiara la dipendenza da go-common in `tsconfig.json` con `"references": [{ "path": "../../../packages/go-common" }]`. Questo abilita build incrementali e garanzia sull'ordine di compilazione.

### ESLint 9 (Linter)

**Versione**: ESLint 9 con flat config

**Perché è stato scelto**: Analisi statica del codice per catturare errori, far rispettare le convenzioni e impedire pattern pericolosi.

**Configurazione**: `eslint.config.mjs` (singolo file, flat config — niente `.eslintrc`)

Struttura della configurazione:

| Sezione                   | Cosa fa                                            |
| ------------------------- | -------------------------------------------------- |
| **TypeScript rules**      | Strict typing, no-any, naming conventions          |
| **Import rules**          | Ordine import, no duplicati, no circular           |
| **Security rules**        | No eval, no unsafe regex, no prototype pollution   |
| **no-restricted-imports** | Blocca librerie con equivalente in go-common       |
| **no-restricted-syntax**  | Blocca pattern come `new EventEmitter()`           |
| **main.ts rules**         | Regole strutturali per i file main.ts degli script |
| **Prettier**              | Override finale per formattazione                  |

La configurazione include anche un **plugin custom inline** (`goAutomationPlugin`) che definisce la regola `no-extra-functions-in-main`.

```bash
pnpm lint          # Esegui ESLint
pnpm lint --fix    # Correggi automaticamente dove possibile
```

### Prettier (Formatter)

**Cos'è**: Formatter opinato per codice JavaScript/TypeScript.

**Perché è stato scelto**: Elimina le discussioni sullo stile di formattazione. Tutti scrivono codice che sembra uguale.

**Configurazione**: Integrato come ultima regola ESLint (`eslint-plugin-prettier`). Le impostazioni base sono in `prettier.config.*` o nel `package.json`.

```bash
pnpm format:check  # Verifica senza modificare
pnpm format        # Formatta tutti i file
```

**Tip**: Configura VS Code per formattare al salvataggio (`editor.formatOnSave: true`).

### Knip (Dead Code Detector)

**Cos'è**: Analizzatore di codice che trova export inutilizzati, dipendenze non usate, e file orfani.

**Perché è stato scelto**: In un monorepo che cresce, è facile accumulare codice morto. Knip lo trova automaticamente.

**Configurazione**: `knip.config.ts` (o sezione in `package.json`)

```bash
pnpm knip
```

**Cosa segnala**:

- Funzioni/tipi esportati ma mai importati
- Pacchetti in `dependencies` mai usati nel codice
- File `.ts` che nessun modulo importa

### tsx (TypeScript Execute)

**Cos'è**: Runner che esegue TypeScript direttamente senza compilazione, basato su esbuild.

**Perché è stato scelto**: Per il dev mode — iterazione rapidissima senza dover aspettare `tsc`.

**Uso**: Configurato come comando `dev` in ogni script:

```json
{
  "scripts": {
    "dev": "tsx src/index.ts"
  }
}
```

### Scaffold Validator

**Cos'è**: Tool custom (`bins/validate-scaffold/`) che verifica la struttura di ogni script contro un set di regole.

**Perché è stato creato**: Per garantire che tutti gli script seguano la struttura a 3 file e le convenzioni del progetto, senza dipendere solo dalla code review.

**Come funziona**: Lo `ScaffoldEngine` esegue regole definite in `rules.ts`. Ogni regola ha un tipo di check:

| Tipo check          | Cosa verifica                                          |
| ------------------- | ------------------------------------------------------ |
| `file-exists`       | Un file corrispondente al glob esiste                  |
| `file-contains`     | Il contenuto matcha una RegExp                         |
| `file-not-contains` | Il contenuto NON matcha una RegExp                     |
| `json-has-key`      | Un JSON ha una chiave a un certo path                  |
| `json-key-equals`   | Il valore di una chiave JSON è uguale al valore atteso |
| `custom`            | Funzione async custom                                  |

```bash
pnpm validate:scaffold
```

### GitHub Actions CI

**Cos'è**: La pipeline di Continuous Integration che gira su ogni push e PR.

**Configurazione**: `.github/workflows/ci.yml`

La pipeline definisce 8 job paralleli (typecheck, lint, format, knip, scaffold, build, test, coverage) e un job finale `ci-success` che verifica che tutti siano passati. Questo job è il **branch protection check** — senza il suo successo, la PR non può essere mergiata.

I job usano un workflow riutilizzabile (`.github/workflows/ci-job.yml`) per evitare duplicazione della configurazione di setup (checkout, Node.js, pnpm, cache).

---

## Riferimenti e Link Utili

### Documentazione Interna

| Documento                                | Contenuto                                       |
| ---------------------------------------- | ----------------------------------------------- |
| [ARCHITECTURE.md](ARCHITECTURE.md)       | Struttura del monorepo, pnpm, TypeScript config |
| [GOCOMMON.md](GOCOMMON.md)               | API della libreria go-common                    |
| [GUIDE_LINES.md](GUIDE_LINES.md)         | Coding standards TypeScript                     |
| [CONVENTIONS.md](CONVENTIONS.md)         | Regole uso go-common, pacchetti vietati         |
| [DEPLOY.md](DEPLOY.md)                   | Docker, standalone, Terraform, AWS              |
| [ONBOARDING.md](ONBOARDING.md)           | Setup ambiente per nuovi sviluppatori           |
| [README-TEMPLATE.md](README-TEMPLATE.md) | Template README per script                      |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Problemi comuni e soluzioni                     |
| [RUNBOOKENGINE.md](RUNBOOKENGINE.md)     | Motore di esecuzione runbook                    |

### Risorse Esterne

| Risorsa                       | URL                                                                  |
| ----------------------------- | -------------------------------------------------------------------- |
| TypeScript Handbook           | https://www.typescriptlang.org/docs/                                 |
| Google TypeScript Style Guide | https://ts.dev/style/                                                |
| pnpm Workspaces               | https://pnpm.io/workspaces                                           |
| esbuild Documentation         | https://esbuild.github.io/                                           |
| AWS Lambda Node.js            | https://docs.aws.amazon.com/lambda/latest/dg/lambda-nodejs.html      |
| Knip                          | https://knip.dev/                                                    |
| ESLint Flat Config            | https://eslint.org/docs/latest/use/configure/configuration-files-new |

---

**Ultima modifica**: 2026-04-09
**Maintainer**: Team GO - Gestione Operativa
