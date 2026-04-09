# Documentazione go-common

> Documentazione completa della libreria `@go-automation/go-common`.

## Indice

1. [Overview](#overview)
2. [Installazione](#installazione)
3. [Moduli Disponibili](#moduli-disponibili)
4. [Core - GOScript](#core---goscript)
5. [Core - Logger](#core---logger)
6. [Core - Prompt](#core---prompt)
7. [Core - Configuration](#core---configuration)
8. [Core - Importers/Exporters](#core---importersexporters)
9. [Core - File Operations](#core---file-operations)
10. [Core - Environment Detection](#core---environment-detection)
11. [Core - Deployment Mode](#core---deployment-mode)
12. [Core - DynamoDB Query Service](#core---dynamodb-query-service)
13. [AWS - Credentials Management](#aws---credentials-management)
14. [SEND SDK](#send-sdk)
15. [SEND - Timeline Service](#send---timeline-service)

---

## Overview

`@go-automation/go-common` e la libreria condivisa che fornisce:

- **GOScript** - Framework per creare script CLI
- **Logging** - Sistema di logging strutturato (console e file)
- **Configuration** - Gestione configurazione multi-provider
- **Prompts** - Spinner, barre di caricamento, input utente
- **Importers/Exporters** - Lettura/scrittura CSV, JSON, HTML
- **AWS Credentials** - Gestione automatica credenziali SSO
- **DynamoDB Query Service** - Query generiche su DynamoDB con unmarshalling automatico
- **SEND SDK** - Client per API notifiche SEND
- **SEND Timeline Service** - Query timeline notifiche da DynamoDB

### Esportazioni Principali

```typescript
import { Core, SEND, GOAWSCredentialsManager } from '@go-automation/go-common';

// Core utilities
const script = new Core.GOScript({ ... });
const logger = new Core.GOLogger([...]);
const importer = new Core.GOCSVListImporter({ ... });

// DynamoDB Query Service (generico)
const queryService = new Core.DynamoDBQueryService(script.aws.dynamoDB);

// SEND SDK
const sdk = new SEND.SENDNotifications({ ... });

// SEND Timeline Service (DynamoDB)
const timelineService = new SEND.SENDTimelineService(script.aws.dynamoDB);

// AWS Credentials
const credManager = new GOAWSCredentialsManager({ ... });
```

---

## Installazione

```bash
# In uno script del workspace
pnpm add @go-automation/go-common@workspace:*
```

```json
// package.json
{
  "dependencies": {
    "@go-automation/go-common": "workspace:*"
  }
}
```

---

## Moduli Disponibili

| Modulo | Namespace        | Descrizione                                         |
| ------ | ---------------- | --------------------------------------------------- |
| Core   | `Core`           | Utilities core (script, logging, config, importers) |
| SEND   | `SEND`           | SDK per notifiche digitali SEND                     |
| AWS    | (export diretto) | Gestione credenziali AWS SSO                        |

### Import Examples

```typescript
// Import namespace
import { Core } from '@go-automation/go-common';
const script = new Core.GOScript({ ... });

// Import specifico
import { GOScript, GOLogger, GOCSVListImporter } from '@go-automation/go-common/Core';

// SEND SDK
import { SEND } from '@go-automation/go-common';
const sdk = new SEND.SENDNotifications({ ... });

// AWS (export diretto)
import { GOAWSCredentialsManager } from '@go-automation/go-common';
```

---

## Core - GOScript

`GOScript` e il framework base per creare script CLI. Integra logging, configurazione e prompts in un unico sistema.

### Creazione Base

```typescript
import { Core } from '@go-automation/go-common';

const script = new Core.GOScript({
  metadata: {
    name: 'My Script',
    version: '1.0.0',
    description: 'Descrizione dello script',
    authors: ['Team GO'],
  },
  config: {
    parameters: [
      {
        name: 'input.file',
        type: Core.GOConfigParameterType.STRING,
        description: 'File di input',
        required: true,
        aliases: ['i'],
      },
      {
        name: 'verbose',
        type: Core.GOConfigParameterType.BOOL,
        description: 'Output dettagliato',
        required: false,
        defaultValue: false,
        aliases: ['v'],
      },
    ],
  },
});
```

### Esecuzione Script

```typescript
// Interfaccia tipizzata per la configurazione
interface MyConfig {
  readonly inputFile: string;
  readonly verbose: boolean;
}

script
  .run(async () => {
    // Ottieni configurazione tipizzata (ASYNC - usa await!)
    const config = await script.getConfiguration<MyConfig>();

    script.logger.section('Avvio elaborazione');
    script.logger.info(`File input: ${config.inputFile}`);

    // Spinner per operazioni lunghe
    script.prompt.startSpinner('Elaborazione in corso...');

    try {
      await processData(config);
      script.prompt.spinnerStop('Elaborazione completata');
    } catch (error) {
      script.prompt.spinnerFail('Elaborazione fallita');
      throw error;
    }

    script.logger.success('Script completato');
  })
  .catch(() => {
    process.exit(1);
  });
```

**Nota importante**: `getConfiguration<T>()` e ora **async** e richiede sempre `await`. Questo permette il supporto per `asyncFallback` nei parametri.

### Tipi di Parametro

| Tipo           | Descrizione    | CLI Example        |
| -------------- | -------------- | ------------------ |
| `STRING`       | Stringa        | `--name "valore"`  |
| `INT`          | Intero         | `--count 10`       |
| `DOUBLE`       | Decimale       | `--threshold 0.5`  |
| `BOOL`         | Booleano       | `--verbose`        |
| `STRING_ARRAY` | Array stringhe | `--tags a,b,c`     |
| `INT_ARRAY`    | Array interi   | `--ids 1,2,3`      |
| `DOUBLE_ARRAY` | Array decimali | `--values 1.5,2.5` |
| `BUFFER`       | Dati binari    | `--data <base64>`  |

### Async Fallback per Parametri

La proprieta `asyncFallback` permette di fornire un valore di default tramite una funzione asincrona quando il parametro non e presente in CLI, file di configurazione o variabili d'ambiente.

#### Tipo

```typescript
type GOConfigParameterFallback<T = unknown> = () => Promise<T>;
```

#### Ordine di Risoluzione

I valori dei parametri vengono risolti in questo ordine (il primo valore trovato vince):

1. **Provider** (CLI args, config file JSON/YAML, env vars)
2. **`defaultValue`** (se definito nel parametro)
3. **`asyncFallback`** (se definito, viene chiamato e awaited)
4. **`undefined`**

#### Esempio

```typescript
import { Core } from '@go-automation/go-common';
import * as fs from 'fs/promises';

// Funzione che carica pattern da file
async function loadPatternsFromFile(): Promise<string[]> {
  try {
    const content = await fs.readFile('./defaults/patterns.json', 'utf-8');
    return JSON.parse(content);
  } catch {
    return []; // Fallback se il file non esiste
  }
}

const script = new Core.GOScript({
  metadata: { ... },
  config: {
    parameters: [
      {
        name: 'ignore.patterns',
        type: Core.GOConfigParameterType.STRING_ARRAY,
        description: 'Patterns to ignore',
        required: false,
        // asyncFallback viene chiamato SOLO se il valore non e fornito
        // da CLI, config file o env vars
        asyncFallback: loadPatternsFromFile,
      },
    ],
  },
});

script.run(async () => {
  // getConfiguration() e ASYNC per supportare asyncFallback
  const config = await script.getConfiguration<MyConfig>();

  // config.ignorePatterns e garantito essere un array
  // (da CLI, config file, env, o asyncFallback)
  console.log(config.ignorePatterns);
});
```

#### Casi d'Uso Tipici

| Caso d'Uso          | Descrizione                                          |
| ------------------- | ---------------------------------------------------- |
| Caricamento da file | Pattern, whitelist, configurazioni esterne           |
| Chiamate API        | Recupero configurazione da servizi remoti            |
| Database            | Lettura configurazione da database                   |
| Secret Manager      | Recupero secrets da AWS Secrets Manager, Vault, etc. |

#### Differenza tra `defaultValue` e `asyncFallback`

| Proprieta       | Tipo               | Quando Usare                                       |
| --------------- | ------------------ | -------------------------------------------------- |
| `defaultValue`  | Valore statico     | Valori semplici e costanti                         |
| `asyncFallback` | `() => Promise<T>` | Valori che richiedono I/O, API calls, computazione |

**Nota**: Se entrambi sono definiti, `defaultValue` ha la precedenza su `asyncFallback`.

### Signal Handlers Automatici

Il metodo `run()` di GOScript configura automaticamente i signal handlers per un graceful shutdown. **Non e necessario implementarli manualmente negli script**.

#### Segnali Gestiti

| Segnale   | Trigger                               | Descrizione                             |
| --------- | ------------------------------------- | --------------------------------------- |
| `SIGTERM` | `docker stop`, Kubernetes termination | Segnale standard di terminazione        |
| `SIGINT`  | `Ctrl+C` nel terminale                | Interrupt da tastiera                   |
| `SIGQUIT` | `Ctrl+\` nel terminale                | Quit con core dump (gestito gracefully) |

#### Comportamento

Quando viene ricevuto un segnale:

1. **Log warning**: Viene loggato l'inizio dello shutdown
2. **Cleanup**: Viene chiamato il metodo `cleanup()` per rilasciare le risorse
3. **Exit**: Il processo termina con codice 0

Se viene ricevuto un secondo segnale durante lo shutdown, il processo termina immediatamente con codice 1.

#### Esempio di Flow

```
$ node dist/main.js
[INFO] Script started...
[INFO] Processing data...
^C                                    # Utente preme Ctrl+C
[WARN] Received SIGINT, initiating graceful shutdown...
[INFO] Waiting for current operations to complete...
[INFO] Cleanup completed
$ echo $?
0
```

#### Hook onCleanup

Per eseguire logica custom durante lo shutdown, usa l'hook `onCleanup`:

```typescript
const script = new Core.GOScript({
  // ...
  hooks: {
    onCleanup: async () => {
      // Chiudi connessioni database
      await database.close();
      // Flush buffer di logging
      await logger.flush();
      // Rilascia altre risorse
      console.log('Custom cleanup completed');
    },
  },
});
```

#### Vantaggi

- **Zero configurazione**: Funziona out-of-the-box
- **Container-ready**: Compatibile con Docker, Kubernetes, ECS
- **Graceful**: Attende il completamento delle operazioni in corso
- **Idempotent**: Gestisce segnali ripetuti senza crash

### Lifecycle Hooks

```typescript
const script = new Core.GOScript({
  // ...metadata e config

  hooks: {
    onBeforeInit: async () => {
      console.log("Prima dell'inizializzazione");
    },
    onAfterInit: async () => {
      console.log("Dopo l'inizializzazione");
    },
    onBeforeConfigLoad: async () => {
      console.log('Prima del caricamento config');
    },
    onAfterConfigLoad: async (config) => {
      console.log('Config caricata:', config);
    },
    onBeforeRun: async () => {
      console.log("Prima dell'esecuzione");
    },
    onAfterRun: async () => {
      console.log("Dopo l'esecuzione");
    },
    onError: async (error) => {
      console.error('Errore:', error.message);
    },
    onCleanup: async () => {
      console.log('Cleanup risorse');
    },
  },
});
```

### Opzioni di Logging

```typescript
const script = new Core.GOScript({
  // ...

  logging: {
    console: true, // Abilita console logging (default: true)
    file: true, // Abilita file logging (default: true)
    logConfigOnStart: true, // Log configurazione all'avvio (default: true)
    logFilePath: './custom.log', // Path custom per log file
  },
});
```

### AWS Credentials

Se lo script definisce il parametro `aws.profile`, GOScript gestisce automaticamente le credenziali SSO.

```typescript
const script = new Core.GOScript({
  config: {
    parameters: [
      {
        name: 'aws.profile',
        type: Core.GOConfigParameterType.STRING,
        description: 'AWS SSO profile name',
        required: true,
        aliases: ['ap'],
      },
    ],
    awsCredentials: {
      autoLogin: true, // Login automatico se scadute
      interactive: true, // Chiedi conferma prima del login
      maxRetries: 1, // Tentativi dopo login
      loginTimeout: 120000, // Timeout login (2 min)
    },
  },
});
```

---

## Core - Logger

Sistema di logging strutturato con supporto per console e file.

### Utilizzo Base

```typescript
import { Core } from '@go-automation/go-common';

// Crea logger con handlers
const logger = new Core.GOLogger([
  new Core.GOConsoleLoggerHandler(),
  new Core.GOFileLoggerHandler(paths, 'script.log'),
]);

// Oppure usa quello integrato in GOScript
script.logger.info('Messaggio informativo');
script.logger.warning('Attenzione');
script.logger.error('Errore');
script.logger.success('Completato');
```

### Metodi Disponibili

| Metodo         | Descrizione       | Stile Console     |
| -------------- | ----------------- | ----------------- |
| `text(msg)`    | Testo semplice    | Normale           |
| `info(msg)`    | Informazione      | Blu               |
| `success(msg)` | Successo          | Verde             |
| `warning(msg)` | Avviso            | Giallo            |
| `error(msg)`   | Errore            | Rosso             |
| `fatal(msg)`   | Errore fatale     | Solo su file      |
| `section(msg)` | Sezione           | Header formattato |
| `step(msg)`    | Step di processo  | Con bullet point  |
| `header(msg)`  | Header principale | Bold              |
| `newline()`    | Linea vuota       | -                 |

### Tabelle Formattate

```typescript
// Tabella con colonne definite
script.logger.table({
  columns: [
    { header: 'Nome', key: 'name', width: 20 },
    { header: 'Valore', key: 'value', width: 30, align: 'right' },
  ],
  data: [
    { name: 'Parametro 1', value: 'Valore 1' },
    { name: 'Parametro 2', value: 'Valore 2' },
  ],
  border: true,
  headerSeparator: true,
});

// Tabella semplice (auto-detect colonne)
script.logger.simpleTable([
  { name: 'Alice', age: 30 },
  { name: 'Bob', age: 25 },
]);

// Tabella key-value
script.logger.keyValueTable({
  Profile: 'my-profile',
  Region: 'eu-south-1',
  'Start Date': '2024-12-01',
});
```

---

## Core - Prompt

Sistema unificato per spinner, barre di caricamento e input utente.

### Spinner Semplice

```typescript
// Start spinner
script.prompt.startSpinner('Caricamento...');

// Update messaggio
script.prompt.updateSpinner('Elaborazione file 1...');
script.prompt.updateSpinner('Elaborazione file 2...');

// Stop con stato
script.prompt.spinnerStop('Completato'); // Successo (verde)
script.prompt.spinnerFail('Fallito'); // Errore (rosso)
script.prompt.spinnerWarn('Attenzione'); // Warning (giallo)
script.prompt.spinnerInfo('Info'); // Info (blu)
```

### Multi-Spinner (Task Paralleli)

```typescript
// Avvia task paralleli
script.prompt.spin('task1', 'Elaborazione file 1...');
script.prompt.spin('task2', 'Elaborazione file 2...');
script.prompt.spin('task3', 'Elaborazione file 3...');

// Aggiorna singolo task
script.prompt.spin('task1', 'File 1: 50%...');

// Completa task individuali
script.prompt.spinSucceed('task1', 'File 1 completato');
script.prompt.spinFail('task2', 'File 2 fallito');
script.prompt.spinWarn('task3', 'File 3 con warning');
```

### Barra di Caricamento

```typescript
script.prompt.startLoading('Downloading...');

for (let i = 0; i <= 100; i += 10) {
  await delay(100);
  script.prompt.updateLoading(i, `Progress: ${i}%`);
}

script.prompt.completeLoading('Download completato');
// oppure
script.prompt.failLoading('Download fallito');
```

### Input Utente

```typescript
// Testo
const name = await script.prompt.text('Nome:', { initial: 'default' });

// Password (nascosta)
const password = await script.prompt.password('Password:');

// Numero
const count = await script.prompt.number('Quantita:', { min: 1, max: 100 });

// Conferma Si/No
const confirmed = await script.prompt.confirm('Procedere?', false);

// Selezione singola
const env = await script.prompt.select('Ambiente:', [
  { title: 'Development', value: 'dev' },
  { title: 'UAT', value: 'uat' },
  { title: 'Production', value: 'prod' },
]);

// Selezione multipla
const features = await script.prompt.multiselect('Features:', [
  { title: 'Feature A', value: 'a', selected: true },
  { title: 'Feature B', value: 'b' },
  { title: 'Feature C', value: 'c' },
]);

// Autocomplete
const city = await script.prompt.autocomplete('Citta:', ['Roma', 'Milano', 'Napoli', 'Torino']);
```

---

## Core - Configuration

Sistema di configurazione multi-provider con priorita definita.

### Priorita dei Provider

1. **Command Line** - `--param-name value`
2. **JSON File** - `configs/config.json`
3. **YAML File** - `configs/config.yaml`
4. **Environment** - `.env` file e variabili ambiente
5. **Default Values** - valori definiti nei parametri

### Trasformazione Nomi

| Formato Sorgente | CLI Flag        | Env Variable  | Property     |
| ---------------- | --------------- | ------------- | ------------ |
| `start.date`     | `--start-date`  | `START_DATE`  | `startDate`  |
| `aws.profile`    | `--aws-profile` | `AWS_PROFILE` | `awsProfile` |
| `verbose`        | `--verbose`     | `VERBOSE`     | `verbose`    |

### Config Providers Disponibili

```typescript
import { Core } from '@go-automation/go-common';

// Command Line
const cliProvider = new Core.GOCommandLineConfigProvider();

// JSON File
const jsonProvider = new Core.GOJSONConfigProvider({
  filePath: './configs/config.json',
  optional: true,
});

// YAML File
const yamlProvider = new Core.GOYAMLConfigProvider({
  filePath: './configs/config.yaml',
  optional: true,
});

// Environment Variables
const envProvider = new Core.GOEnvironmentConfigProvider({
  environmentFilePath: './configs/.env',
});

// In-Memory (per testing)
const memProvider = new Core.GOInMemoryConfigProvider({
  'param.name': 'value',
});
```

### Config Reader Diretto

```typescript
const reader = new Core.GOConfigReader([cliProvider, jsonProvider, yamlProvider, envProvider]);

// Leggi valore (restituisce undefined se non trovato)
const value = reader.getValue('param.name');

// Leggi con tipo specifico
const strValue = reader.getString('param.name');
const intValue = reader.getInt('param.count');
const boolValue = reader.getBool('param.verbose');
```

---

## Core - Importers/Exporters

Utilities per lettura e scrittura di file dati.

### CSV Importer

```typescript
import { Core } from '@go-automation/go-common';

interface DataRow {
  id: string;
  name: string;
  value: number;
}

const importer = new Core.GOCSVListImporter<DataRow>({
  filePath: './data/input.csv',
  delimiter: ',',
  hasHeader: true,
  encoding: 'utf-8',
});

// Con eventi
importer.on('row', (row, index) => {
  console.log(`Row ${index}:`, row);
});

importer.on('error', (error) => {
  console.error('Error:', error);
});

// Importa tutti i dati
const result = await importer.import();
console.log(`Imported ${result.rows.length} rows`);
```

### CSV Exporter

```typescript
const exporter = new Core.GOCSVListExporter<DataRow>({
  filePath: './data/output.csv',
  delimiter: ',',
  includeHeader: true,
  columns: ['id', 'name', 'value'],
});

// Scrivi dati
await exporter.export([
  { id: '1', name: 'Item 1', value: 100 },
  { id: '2', name: 'Item 2', value: 200 },
]);
```

### JSON Importer/Exporter

```typescript
// Import
const jsonImporter = new Core.GOJSONListImporter<DataRow>({
  filePath: './data/input.json',
});
const result = await jsonImporter.import();

// Export
const jsonExporter = new Core.GOJSONListExporter<DataRow>({
  filePath: './data/output.json',
  pretty: true,
});
await jsonExporter.export(data);
```

### HTML Exporter

```typescript
const htmlExporter = new Core.GOHTMLListExporter<DataRow>({
  filePath: './reports/report.html',
  title: 'Report Dati',
  columns: [
    { header: 'ID', key: 'id' },
    { header: 'Nome', key: 'name' },
    { header: 'Valore', key: 'value' },
  ],
});
await htmlExporter.export(data);
```

---

## Core - File Operations

Utilities per la gestione dei file e path resolution con supporto per modalità monorepo e standalone.

### GOPaths

`GOPaths` gestisce la risoluzione dei percorsi adattandosi automaticamente alla modalità di deployment.

#### Costruttore

```typescript
import { Core } from '@go-automation/go-common';

// Costruttore semplice (usa basename di argv[1] come script name)
const paths = new Core.GOPaths('my-script');

// Costruttore con opzioni
const pathsWithOptions = new Core.GOPaths({
  scriptName: 'my-script',
  baseDir: '/custom/base/dir', // Override per standalone mode
});
```

#### GOPathsOptions

```typescript
interface GOPathsOptions {
  /** Script name (defaults to argv[1] basename) */
  readonly scriptName?: string;
  /** Override base directory (overrides GO_BASE_DIR env var) */
  readonly baseDir?: string;
}
```

#### Path Resolution per Deployment Mode

| Directory | Monorepo                        | Standalone                 |
| --------- | ------------------------------- | -------------------------- |
| Base      | `{monorepoRoot}`                | `{baseDir}` (default: cwd) |
| Data      | `{root}/data/{script}/`         | `{baseDir}/data/`          |
| Config    | `{root}/data/{script}/configs/` | `{baseDir}/configs/`       |
| Input     | `{dataDir}/inputs/`             | `{dataDir}/inputs/`        |
| Output    | `{dataDir}/outputs/`            | `{dataDir}/outputs/`       |

#### Risoluzione Path

```typescript
import { Core } from '@go-automation/go-common';

const paths = new Core.GOPaths('my-script');

// Risolvi path per tipo
const inputPath = paths.resolvePath('data.csv', Core.GOPathType.INPUT);
// Monorepo: data/my-script/inputs/data.csv
// Standalone: {baseDir}/data/inputs/data.csv

const outputPath = paths.resolvePath('report.csv', Core.GOPathType.OUTPUT);
// Monorepo: data/my-script/outputs/my-script_{timestamp}/report.csv
// Standalone: {baseDir}/data/outputs/my-script_{timestamp}/report.csv

const configPath = paths.resolvePath('config.json', Core.GOPathType.CONFIG);
// Monorepo: data/my-script/configs/config.json (con fallback locale)
// Standalone: {baseDir}/configs/config.json
```

#### Metodi Deployment Mode

```typescript
const paths = new Core.GOPaths('my-script');

// Check deployment mode
console.log('Mode:', paths.getDeploymentMode()); // 'monorepo' o 'standalone'
console.log('Is monorepo:', paths.isMonorepo());
console.log('Is standalone:', paths.isStandalone());

// Get base directory
console.log('Base dir:', paths.getBaseDir());

// Get project root (solo in monorepo mode!)
if (paths.isMonorepo()) {
  console.log('Project root:', paths.getProjectRoot());
}

// Summary per debug
console.log(paths.getSummary());
```

**Nota**: `getProjectRoot()` lancia un errore se chiamato in modalità standalone. Usa `getDataDir()` o `getBaseDir()` invece.

#### Metodi Directory

```typescript
const paths = new Core.GOPaths('my-script');

// Directory dati script
paths.getDataDir(); // data/{script}/ o {baseDir}/data/

// Directory configurazione
paths.getDataConfigDir(); // configs centralizzata
paths.getLocalConfigsDir(); // configs locale (fallback)

// Directory input/output
paths.getInputsDir(); // inputs/
paths.getOutputsBaseDir(); // outputs/
paths.getExecutionOutputDir(); // outputs/{script}_{timestamp}/
```

#### Environment Variables per Override

Tutte le directory possono essere sovrascritte tramite variabili d'ambiente:

| Variabile            | Descrizione                            | Priorita    |
| -------------------- | -------------------------------------- | ----------- |
| `GO_DEPLOYMENT_MODE` | Forza `monorepo` o `standalone`        | 1 (massima) |
| `GO_BASE_DIR`        | Override base directory per standalone | 2           |
| `GO_DATA_DIR`        | Override data directory                | 3           |
| `GO_CONFIG_DIR`      | Override config directory              | 3           |
| `GO_INPUT_DIR`       | Override input directory               | 3           |
| `GO_OUTPUT_DIR`      | Override output directory              | 3           |

```bash
# Forza standalone mode con directory custom
GO_DEPLOYMENT_MODE=standalone \
GO_BASE_DIR=/app \
GO_DATA_DIR=/app/data \
node dist/main.js
```

#### Path Resolution con Metadati

```typescript
// Con informazioni dettagliate per logging
const result = paths.resolvePathWithInfo('file.csv', Core.GOPathType.OUTPUT);

if (result) {
  if (result.isAbsolute) {
    console.log('Using absolute path:', result.path);
  } else {
    // TypeScript garantisce che resolvedDir esiste per path relativi
    console.log('Output directory:', result.resolvedDir);
    console.log('Output file:', result.path);
  }
}
```

### File Copier (in GOScript)

```typescript
// Registra file per la copia finale
const inputPath = script.resolveAndRegisterFile('data.csv', Core.GOPathType.INPUT);
const configPath = script.resolveAndRegisterFile('config.yaml', Core.GOPathType.CONFIG);

// ... esecuzione script ...

// Copia tutti i file registrati nella directory di esecuzione
const report = await script.finalizeFiles();
script.logger.info(`Copiati ${report.summary.copiedFiles} file`);
```

---

## Core - Environment Detection

Rilevamento automatico dell'ambiente di esecuzione e della modalità di deployment.

### Tipi di Ambiente

| Tipo                | Descrizione                               |
| ------------------- | ----------------------------------------- |
| `LOCAL_INTERACTIVE` | Sviluppo locale con terminale interattivo |
| `CI`                | Pipeline CI/CD (GitHub Actions, etc.)     |
| `AWS_LAMBDA`        | AWS Lambda                                |
| `AWS_ECS`           | AWS ECS/Fargate                           |
| `AWS_EC2`           | AWS EC2                                   |
| `AWS_CODEBUILD`     | AWS CodeBuild                             |
| `UNKNOWN`           | Ambiente non riconosciuto                 |

### Modalità di Deployment (GODeploymentMode)

Il sistema rileva automaticamente se lo script e in esecuzione dentro il monorepo o come deployment standalone.

| Modalità     | Descrizione                                                       |
| ------------ | ----------------------------------------------------------------- |
| `MONOREPO`   | Esecuzione all'interno della struttura monorepo (pnpm workspace)  |
| `STANDALONE` | Esecuzione come deployment standalone (Docker, Lambda, EC2, etc.) |

### Utilizzo Base

```typescript
import { Core } from '@go-automation/go-common';

const env = Core.GOExecutionEnvironment.detect();

// Informazioni ambiente
console.log('Tipo ambiente:', env.type);
console.log('E AWS managed:', env.isAWSManaged);
console.log('E interattivo:', env.isInteractive);
console.log('Sorgente credenziali:', env.credentialSource);

// Informazioni deployment mode
console.log('Deployment mode:', env.deploymentMode);
console.log('Monorepo root:', env.monorepoRoot);
```

### Metodi Statici per Deployment Mode

```typescript
import { Core } from '@go-automation/go-common';

// Check deployment mode
if (Core.GOExecutionEnvironment.isMonorepo()) {
  console.log('Running in monorepo mode');
  const root = Core.GOExecutionEnvironment.getMonorepoRoot();
  console.log('Monorepo root:', root);
}

if (Core.GOExecutionEnvironment.isStandalone()) {
  console.log('Running in standalone mode');
}

// Altri metodi utili
Core.GOExecutionEnvironment.isInteractive(); // true se puo interagire con utente
Core.GOExecutionEnvironment.isAWSManaged(); // true se in ambiente AWS gestito
Core.GOExecutionEnvironment.isCI(); // true se in pipeline CI/CD

// Summary per debug
console.log(Core.GOExecutionEnvironment.getSummary());
```

### Logica di Rilevamento Deployment Mode

```
1. GO_DEPLOYMENT_MODE env → se presente, usa il valore esplicito
   ↓
2. Cerca marker monorepo (pnpm-workspace.yaml, package.json con workspaces)
   → Se trovato → MONOREPO + salva root path
   ↓
3. Default → STANDALONE
```

### GOExecutionEnvironmentInfo

Interfaccia completa delle informazioni rilevate:

```typescript
interface GOExecutionEnvironmentInfo {
  // Tipo ambiente
  readonly type: GOExecutionEnvironmentType;
  readonly isInteractive: boolean;
  readonly isAWSManaged: boolean;

  // Credenziali
  readonly credentialSource: GOCredentialSource;
  readonly requiresAwsProfile: boolean;

  // Capacita
  readonly canPromptUser: boolean;
  readonly canOpenBrowser: boolean;

  // AWS
  readonly awsRegion: string | undefined;
  readonly lambdaFunctionName: string | undefined;

  // CI
  readonly ciSystem: string | undefined;

  // Deployment mode (NEW)
  readonly deploymentMode: GODeploymentMode;
  readonly monorepoRoot: string | undefined;

  // Dettagli per debug
  readonly detectionDetails: GOEnvironmentDetectionDetails;
}
```

### GOEnvironmentDetectionDetails

Dettagli del rilevamento per debugging:

```typescript
interface GOEnvironmentDetectionDetails {
  readonly stdoutIsTTY: boolean;
  readonly stdinIsTTY: boolean;
  readonly hasTerminal: boolean;
  readonly hasCIVariable: boolean;
  readonly hasEnvCredentials: boolean;
  readonly hasWebIdentity: boolean;
  readonly hasECSMetadata: boolean;
  readonly hasLambdaEnv: boolean;
  readonly hasCodeBuildEnv: boolean;

  // Deployment mode detection (NEW)
  readonly envDeploymentMode: string | undefined;
  readonly hasPnpmWorkspace: boolean;
  readonly hasPackageJsonWorkspaces: boolean;
  readonly detectedMonorepoRoot: string | undefined;
}
```

### Credential Sources

| Source          | Descrizione                                  |
| --------------- | -------------------------------------------- |
| `SSO_PROFILE`   | AWS SSO Profile                              |
| `ENVIRONMENT`   | Variabili ambiente (AWS_ACCESS_KEY_ID, etc.) |
| `WEB_IDENTITY`  | OIDC Federation Token                        |
| `DEFAULT_CHAIN` | Default AWS credential chain (IAM Role)      |
| `NONE`          | Nessuna credenziale rilevata                 |

---

## Core - Deployment Mode

Supporto per esecuzione in modalità monorepo e standalone.

### Overview

La libreria go-common supporta due modalità di deployment:

| Modalità       | Descrizione                                     | Uso Tipico                              |
| -------------- | ----------------------------------------------- | --------------------------------------- |
| **MONOREPO**   | Esecuzione all'interno della struttura monorepo | Sviluppo locale, CI/CD del monorepo     |
| **STANDALONE** | Esecuzione come deployment indipendente         | Docker, Lambda, EC2, deployment isolati |

### Rilevamento Automatico

Il sistema rileva automaticamente la modalità cercando marker del monorepo:

1. **pnpm-workspace.yaml** - File di configurazione pnpm workspaces
2. **package.json con workspaces** - Campo workspaces nel package.json root

Se nessun marker viene trovato, assume modalità `STANDALONE`.

### Forzare la Modalità

Usa la variabile d'ambiente `GO_DEPLOYMENT_MODE`:

```bash
# Forza monorepo mode
GO_DEPLOYMENT_MODE=monorepo node dist/main.js

# Forza standalone mode
GO_DEPLOYMENT_MODE=standalone node dist/main.js
```

### Variabili d'Ambiente per Path

| Variabile            | Descrizione                          |
| -------------------- | ------------------------------------ |
| `GO_DEPLOYMENT_MODE` | Forza `monorepo` o `standalone`      |
| `GO_BASE_DIR`        | Override base directory (standalone) |
| `GO_DATA_DIR`        | Override data directory              |
| `GO_CONFIG_DIR`      | Override config directory            |
| `GO_INPUT_DIR`       | Override input directory             |
| `GO_OUTPUT_DIR`      | Override output directory            |

### Esempio: Docker Standalone

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copia solo lo script compilato
COPY dist/ ./dist/
COPY configs/ ./configs/
COPY package.json ./

# Forza standalone mode
ENV GO_DEPLOYMENT_MODE=standalone
ENV GO_BASE_DIR=/app
ENV GO_DATA_DIR=/app/data
ENV GO_CONFIG_DIR=/app/configs

RUN npm install --production

CMD ["node", "dist/main.js"]
```

### Esempio: AWS Lambda

```typescript
// handler.ts
import { Core } from '@go-automation/go-common';

// In Lambda, viene rilevato automaticamente come standalone
// ma possiamo configurare i path
process.env.GO_DEPLOYMENT_MODE = 'standalone';
process.env.GO_BASE_DIR = '/tmp';
process.env.GO_DATA_DIR = '/tmp/data';

export const handler = async (event: unknown) => {
  const paths = new Core.GOPaths('lambda-handler');

  console.log('Deployment mode:', paths.getDeploymentMode());
  console.log('Base dir:', paths.getBaseDir());
  console.log('Data dir:', paths.getDataDir());

  // ... logica Lambda
};
```

### Differenze Struttura Directory

**Monorepo Mode:**

```
go-automation/                    # monorepoRoot
├── data/
│   └── my-script/               # per-script data
│       ├── configs/
│       ├── inputs/
│       └── outputs/
├── scripts/
│   └── go/
│       └── my-script/
│           ├── src/
│           └── configs/         # fallback locale
```

**Standalone Mode:**

```
/app/                            # baseDir
├── configs/                     # config directory
├── data/                        # data directory
│   ├── inputs/
│   └── outputs/
└── dist/
    └── main.js
```

### Backward Compatibility

La nuova funzionalità e **completamente retrocompatibile**:

- Script esistenti funzionano senza modifiche
- Il comportamento di default nel monorepo non cambia
- Le nuove variabili d'ambiente sono opzionali

---

## Core - DynamoDB Query Service

Servizio generico per query su tabelle DynamoDB con supporto per prefix/suffix, unmarshalling automatico e query batch con concorrenza controllata.

### Inizializzazione

```typescript
import { Core } from '@go-automation/go-common';

// Usa il client DynamoDB da GOScript
const queryService = new Core.DynamoDBQueryService(script.aws.dynamoDB);
```

### Query Singola

```typescript
// Query base
const result = await queryService.queryByPartitionKey('IUN-123', {
  tableName: 'pn-Timelines',
  keyName: 'iun',
});

console.log(`Found ${result.count} items`);
console.log('Items:', result.items);

// Query con prefix/suffix
const result2 = await queryService.queryByPartitionKey('12345', {
  tableName: 'pn-EcRichiesteMetadati',
  keyName: 'requestId',
  prefix: 'pn-cons-000~',
  suffix: '.PCRETRY_0',
});
// fullKey = "pn-cons-000~12345.PCRETRY_0"
```

### Query Multiple (Batch)

Query multiple chiavi con concorrenza controllata (10 parallele):

```typescript
const keys = ['key1', 'key2', 'key3', 'key4', 'key5'];

const results = await queryService.queryMultipleByPartitionKey(
  keys,
  {
    tableName: 'my-table',
    keyName: 'pk',
  },
  (current, total) => {
    console.log(`Progress: ${current}/${total}`);
  },
);

for (const result of results) {
  console.log(`Key: ${result.keyValue}, Items: ${result.count}`);
}
```

### Tipizzazione Risultati

Usa generics per tipizzare i risultati:

```typescript
interface MyItem {
  readonly id: string;
  readonly status: string;
  readonly createdAt: string;
}

const result = await queryService.queryByPartitionKey<MyItem>('key1', {
  tableName: 'my-table',
  keyName: 'pk',
});

// result.items e di tipo ReadonlyArray<MyItem>
for (const item of result.items) {
  console.log(item.status); // Tipizzato!
}
```

### DynamoDBQueryOptions

| Proprieta   | Tipo      | Descrizione                             |
| ----------- | --------- | --------------------------------------- |
| `tableName` | `string`  | Nome della tabella DynamoDB             |
| `keyName`   | `string`  | Nome dell'attributo partition key       |
| `prefix`    | `string?` | Prefisso da aggiungere al valore chiave |
| `suffix`    | `string?` | Suffisso da aggiungere al valore chiave |

### DynamoDBQueryResult<T>

| Proprieta  | Tipo               | Descrizione                                   |
| ---------- | ------------------ | --------------------------------------------- |
| `keyValue` | `string`           | Valore chiave originale (senza prefix/suffix) |
| `fullKey`  | `string`           | Chiave completa con prefix/suffix             |
| `items`    | `ReadonlyArray<T>` | Risultati unmarshalled                        |
| `count`    | `number`           | Numero di items                               |

### Caratteristiche

- **Unmarshalling automatico**: Usa `@aws-sdk/util-dynamodb` per convertire il formato DynamoDB in oggetti JS
- **Pagination automatica**: Gestisce `LastEvaluatedKey` per risultati > 1MB
- **Concorrenza controllata**: Query batch con chunk di 10 parallele
- **Progress callback**: Notifica avanzamento per operazioni lunghe
- **Generics**: Tipizzazione opzionale dei risultati

---

## AWS - Credentials Management

Gestione automatica delle credenziali AWS SSO.

### Utilizzo Base

```typescript
import { GOAWSCredentialsManager } from '@go-automation/go-common';

const manager = new GOAWSCredentialsManager({
  autoLogin: true, // Tenta login automatico se scadute
  interactive: true, // Chiedi conferma prima del login
  maxRetries: 1, // Tentativi dopo il login
  loginTimeout: 120000, // Timeout per il login (ms)
  onLog: (msg, level) => console.log(`[${level}] ${msg}`),
  onPrompt: async (msg) => {
    // Ritorna true per procedere, false per annullare
    return confirm(msg);
  },
});

// Valida credenziali (senza login)
const isValid = manager.validateCredentials('my-profile');

// Assicura credenziali valide (con login se necessario)
const result = await manager.ensureValidCredentials('my-profile');
if (result) {
  console.log('Credenziali valide');
}
```

### Integrazione con GOScript

Quando definisci il parametro `aws.profile`, GOScript gestisce automaticamente le credenziali.

```typescript
const script = new Core.GOScript({
  config: {
    parameters: [
      {
        name: 'aws.profile',
        type: Core.GOConfigParameterType.STRING,
        required: true,
      },
    ],
  },
});

// Le credenziali vengono validate/ottenute automaticamente in script.run()
```

---

## SEND SDK

SDK TypeScript per le API di notifiche digitali SEND.

### Inizializzazione

```typescript
import { SEND } from '@go-automation/go-common';

const sdk = new SEND.SENDNotifications({
  basePath: 'https://api.send.pagopa.it',
  apiKey: 'your-api-key',
  timeout: 30000,
  debug: false,
});
```

### Notification Service

```typescript
// Crea notifica con builder
const notification = sdk
  .createNotificationBuilder()
  .setSenderDenomination('Comune di Roma')
  .setSenderTaxId('12345678901')
  .setSubject('Avviso di pagamento')
  .setAbstract('Breve descrizione')
  .addRecipient({
    recipientType: SEND.SENDRecipientType.PF,
    taxId: 'RSSMRA80A01H501U',
    denomination: 'Mario Rossi',
  })
  .addDocument({
    digests: { sha256: '...' },
    contentType: 'application/pdf',
    ref: { key: '...', versionToken: '...' },
  })
  .build();

// Invia notifica
const response = await sdk.notifications.create(notification);
console.log('Request ID:', response.requestId);

// Attendi e ottieni IUN
const status = await sdk.notifications.waitForAccepted(response.requestId, {
  maxAttempts: 30,
  intervalMs: 2000,
});
console.log('IUN:', status.iun);
```

### Attachment Service

```typescript
// Preload URL per upload
const preloadResponse = await sdk.attachment.preload({
  contentType: 'application/pdf',
  sha256: 'hash-del-file',
});

// Upload file
await sdk.attachment.upload(preloadResponse.url, fileBuffer, {
  contentType: 'application/pdf',
  sha256: 'hash-del-file',
});

// Ottieni riferimento per la notifica
const docRef = {
  key: preloadResponse.key,
  versionToken: preloadResponse.versionToken,
};
```

### Import Worker

Per importazioni batch da CSV:

```typescript
import { SEND } from '@go-automation/go-common';

const worker = new SEND.SENDNotificationImportWorker({
  sdk: sdk,
  inputFile: './notifications.csv',
  outputFile: './results.csv',
  batchSize: 10,
  concurrency: 3,
});

worker.on('progress', (progress) => {
  console.log(`Progress: ${progress.processed}/${progress.total}`);
});

worker.on('error', (error) => {
  console.error('Error:', error);
});

const result = await worker.run();
console.log(`Completate: ${result.successful}, Fallite: ${result.failed}`);
```

### Tipi e Modelli

```typescript
import { SEND } from '@go-automation/go-common';

// Tipi destinatario
SEND.SENDRecipientType.PF; // Persona Fisica
SEND.SENDRecipientType.PG; // Persona Giuridica

// Stati notifica
SEND.SENDNotificationStatus.ACCEPTED;
SEND.SENDNotificationStatus.DELIVERING;
SEND.SENDNotificationStatus.DELIVERED;
SEND.SENDNotificationStatus.CANCELLED;

// Tipi domicilio digitale
SEND.SENDDigitalDomicileType.PEC;
SEND.SENDDigitalDomicileType.EMAIL;

// Policy commissioni
SEND.SENDNotificationFeePolicy.FLAT_RATE;
SEND.SENDNotificationFeePolicy.DELIVERY_MODE;
```

---

## SEND - Timeline Service

Servizio per query delle timeline notifiche SEND dalla tabella DynamoDB `pn-Timelines`.

### Inizializzazione

```typescript
import { SEND } from '@go-automation/go-common';

// Usa il client DynamoDB da GOScript
const timelineService = new SEND.SENDTimelineService(script.aws.dynamoDB);
```

### Query Timeline Singola

```typescript
const result = await timelineService.queryTimeline({
  iun: 'ABCD-EFGH-IJKL-202401-A-1',
  dateFilter: null,
});

console.log(`IUN: ${result.iun}`);
console.log(`PA ID: ${result.paId}`);
console.log(`Notification Sent At: ${result.notificationSentAt}`);
console.log(`Timeline elements: ${result.timeline.length}`);

for (const element of result.timeline) {
  console.log(`- ${element.category}: ${element.timelineElementId}`);
}
```

### Query Timeline Multiple (Batch)

```typescript
const iuns = [
  { iun: 'IUN-1', dateFilter: null },
  { iun: 'IUN-2', dateFilter: null },
  { iun: 'IUN-3', dateFilter: '2024-01-15' }, // Con filtro data
];

const results = await timelineService.queryTimelines(iuns, (current, total) => {
  console.log(`Progress: ${current}/${total}`);
});

for (const result of results) {
  console.log(`${result.iun}: ${result.timeline.length} elements`);
}
```

### Filtro per Data

Il `dateFilter` permette di filtrare gli elementi della timeline:

```typescript
// Solo elementi dal 2024-01-15 in poi
const result = await timelineService.queryTimeline({
  iun: 'ABCD-EFGH-IJKL-202401-A-1',
  dateFilter: '2024-01-15',
});
```

### Tipi

#### SENDParsedIun

```typescript
interface SENDParsedIun {
  /** IUN della notifica */
  readonly iun: string;
  /** Filtro data opzionale (formato: YYYY-MM-DD) */
  readonly dateFilter: string | null;
}
```

#### SENDTimelineElement

```typescript
interface SENDTimelineElement {
  /** ID univoco dell'elemento timeline */
  readonly timelineElementId: string;
  /** Categoria dell'evento (es. PREPARE_ANALOG_DOMICILE, SEND_ANALOG_DOMICILE) */
  readonly category: string;
  /** Timestamp dell'evento */
  readonly timestamp: string;
}
```

#### SENDTimelineResult

```typescript
interface SENDTimelineResult {
  /** IUN della notifica */
  readonly iun: string;
  /** ID della PA mittente */
  readonly paId: string | null;
  /** Data/ora invio notifica */
  readonly notificationSentAt: string | null;
  /** Elementi della timeline (ordinati per timestamp) */
  readonly timeline: ReadonlyArray<SENDTimelineElement>;
}
```

### Categorie Timeline Comuni

| Categoria                 | Descrizione                   |
| ------------------------- | ----------------------------- |
| `REQUEST_ACCEPTED`        | Notifica accettata            |
| `AAR_GENERATION`          | Generazione AAR               |
| `GET_ADDRESS`             | Recupero indirizzo            |
| `PREPARE_ANALOG_DOMICILE` | Preparazione invio analogico  |
| `SEND_ANALOG_DOMICILE`    | Invio analogico               |
| `ANALOG_SUCCESS_WORKFLOW` | Workflow analogico completato |
| `REFINEMENT`              | Perfezionamento               |
| `NOTIFICATION_VIEWED`     | Notifica visualizzata         |

### Esempio: Estrazione RequestId

```typescript
import { SEND } from '@go-automation/go-common';

const timelineService = new SEND.SENDTimelineService(script.aws.dynamoDB);

// Query timeline
const results = await timelineService.queryTimelines(iuns);

// Estrai requestId da elementi PREPARE_ANALOG_DOMICILE
const requestIdMap = new Map<string, string>();

for (const result of results) {
  for (const element of result.timeline) {
    if (element.category === 'PREPARE_ANALOG_DOMICILE') {
      requestIdMap.set(result.iun, element.timelineElementId);
      break; // Prendi solo il primo
    }
  }
}

console.log('Request IDs:', requestIdMap);
```

### Caratteristiche

- **Concorrenza controllata**: Query batch con chunk di 10 parallele
- **Date filter**: Filtra elementi per data
- **Ordinamento**: Timeline ordinata per timestamp
- **Progress callback**: Notifica avanzamento per operazioni lunghe
- **Integrazione GOScript**: Usa `script.aws.dynamoDB` per il client

---

## Riferimenti

- [Architettura Monorepo](ARCHITECTURE.md)
- [Coding Guidelines](GUIDE_LINES.md)
- [Scripts - Guida Completa](SCRIPTS.md)
- [AWS SDK v3 Documentation](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)

---

**Ultima modifica**: 2026-01-27
**Maintainer**: Team GO - Gestione Operativa
