# CONVENTIONS.md - go-common Usage Guide for Scripts

> **Ogni script in `scripts/` DEVE utilizzare le funzionalità di `@go-automation/go-common` invece di reimplementarle o installare librerie di terze parti equivalenti.**

Queste convenzioni sono **enforce** automaticamente da:

1. **ESLint** (`eslint.config.mjs`) — blocca import di pacchetti vietati e pattern di codice non conformi
2. **Code Review** — verifica l'aderenza alle convenzioni durante le PR

Per bypassare una regola in casi eccezionali, usa:

```typescript
// eslint-disable-next-line no-restricted-imports -- <giustificazione obbligatoria>
```

---

## Indice

- [CONVENTIONS.md - go-common Usage Guide for Scripts](#conventionsmd---go-common-usage-guide-for-scripts)
  - [Indice](#indice)
  - [Script Framework](#script-framework)
  - [Configurazione e CLI](#configurazione-e-cli)
  - [Logging](#logging)
  - [Importers (lettura dati)](#importers-lettura-dati)
  - [Exporters (scrittura dati)](#exporters-scrittura-dati)
    - [Formati di export (GOExportFormat)](#formati-di-export-goexportformat)
  - [Path Resolution](#path-resolution)
  - [JSON Utilities](#json-utilities)
  - [Prompts e UI](#prompts-e-ui)
  - [HTTP Client](#http-client)
  - [Error Handling](#error-handling)
  - [Events](#events)
  - [AWS Services](#aws-services)
  - [Utilities](#utilities)
  - [Riepilogo Regole ESLint](#riepilogo-regole-eslint)
    - [`no-restricted-imports`](#no-restricted-imports)
    - [`no-restricted-syntax`](#no-restricted-syntax)
    - [Bypass](#bypass)

---

## Script Framework

| Funzionalità                           | Classe go-common   | Pacchetti vietati |
| -------------------------------------- | ------------------ | ----------------- |
| Entry point e lifecycle dello script   | `GOScript`         | -                 |
| Metadata (nome, versione, descrizione) | `GOScriptMetadata` | -                 |

```typescript
import { Core } from '@go-automation/go-common';

const script = new Core.GOScript({
  metadata: { name: 'my-script', version: '1.0.0', description: '...' },
  config: {
    parameters: [
      /* ... */
    ],
  },
});
```

Ogni script **deve** usare `GOScript` come entry point. Non creare entry point custom con `process.argv` parsing manuale.

---

## Configurazione e CLI

| Funzionalità          | Classe go-common                              | Pacchetti vietati                        |
| --------------------- | --------------------------------------------- | ---------------------------------------- |
| Parsing argomenti CLI | `GOConfigReader`, `GOConfigParameterProvider` | `yargs`, `commander`, `minimist`, `meow` |
| Variabili d'ambiente  | `GOConfigEnvProvider`                         | accesso diretto a `process.env`          |
| Validazione parametri | `GOConfigParameter.validator`                 | -                                        |
| Type conversion       | `GOConfigTypeConverter`                       | -                                        |

```typescript
// Definizione parametri nel config
const parameters: Core.GOConfigParameter[] = [
  {
    name: 'input.file',
    type: Core.GOConfigParameterType.STRING,
    description: 'File di input',
    required: true,
    aliases: ['i'],
  },
  {
    name: 'output.format',
    type: Core.GOConfigParameterType.STRING,
    required: false,
    defaultValue: 'txt',
    validator: (value) =>
      Core.isGOExportFormat(String(value)) ||
      `Invalid format "${String(value)}". Valid: ${Core.GO_EXPORT_FORMATS.join(', ')}`,
  },
];

// Accesso ai valori nel main
const config = await script.getConfiguration<MyConfig>();
```

**Vietato**: accesso diretto a `process.env` e parsing manuale di `process.argv`.

---

## Logging

| Funzionalità        | Classe go-common         | Pacchetti vietati                           |
| ------------------- | ------------------------ | ------------------------------------------- |
| Logging strutturato | `GOLogger`               | `winston`, `pino`, `bunyan`, `log4js`       |
| Output colorato     | `GOLogger` (integrato)   | `chalk`, `kleur`, `picocolors`, `colorette` |
| Console handler     | `GOConsoleLoggerHandler` | -                                           |
| File handler        | `GOFileLoggerHandler`    | -                                           |
| Tabelle formattate  | `GOTableFormatter`       | `cli-table3`, `table`                       |

```typescript
// Usa il logger dello script
script.logger.info('Messaggio informativo');
script.logger.warning('Attenzione');
script.logger.error('Errore');
script.logger.section('Titolo Sezione');
script.logger.subsection('Sotto-sezione');

// Tabelle
const table = new Core.GOTableFormatter({ columns: ['Nome', 'Valore'] });
table.addRow(['chiave', '123']);
script.logger.info(table.render());
```

**Vietato**: `console.log`/`console.info` (usa `script.logger`), import di librerie di logging/colori esterne.

---

## Importers (lettura dati)

| Funzionalità                 | Classe go-common     | Pattern vietati                                                    |
| ---------------------------- | -------------------- | ------------------------------------------------------------------ |
| Import JSON / NDJSON         | `GOJSONListImporter` | `readline.createInterface`, parsing JSON manuale con `fs.readFile` |
| Import CSV                   | `GOCSVListImporter`  | `csv-parse`, `csv-parse/sync`                                      |
| Import file di testo (righe) | `GOFileListImporter` | `readline.createInterface`                                         |

```typescript
// JSON / NDJSON import con streaming
const importer = new Core.GOJSONListImporter<MyType>({
  jsonl: 'auto', // rileva automaticamente JSON vs NDJSON
  skipInvalidItems: true,
  wrapSingleObject: true, // singolo oggetto → array di 1 elemento
  rowTransformer: (item) => transformItem(item),
});

for await (const item of importer.importStream(inputPath)) {
  // processa item
}

// CSV import
const csvImporter = new Core.GOCSVListImporter<MyRow>({ delimiter: ',' });
for await (const row of csvImporter.importStream(inputPath)) {
  // processa riga
}

// File di testo (una riga per elemento)
const fileImporter = new Core.GOFileListImporter();
for await (const line of fileImporter.importStream(inputPath)) {
  // processa riga
}
```

Tutti gli importer supportano **streaming** via `importStream()` (async generator) e import completo via `importAll()`.

---

## Exporters (scrittura dati)

| Funzionalità                       | Classe go-common     | Pattern vietati                        |
| ---------------------------------- | -------------------- | -------------------------------------- |
| Export TXT (una riga per valore)   | `GOFileListExporter` | `fs.writeFile`, `fs.writeFileSync`     |
| Export JSON (array pretty-printed) | `GOJSONListExporter` | `fs.writeFile`, `fs.writeFileSync`     |
| Export JSONL (un valore per riga)  | `GOJSONListExporter` | `fs.writeFile`, `fs.createWriteStream` |
| Export CSV                         | `GOCSVListExporter`  | `csv-stringify`, `csv-stringify/sync`  |
| Export HTML (tabella)              | `GOHTMLListExporter` | `fs.writeFile`                         |

```typescript
// TXT export
const txtExporter = new Core.GOFileListExporter({ outputPath });
await txtExporter.export(values);

// JSON export (pretty-printed)
const jsonExporter = new Core.GOJSONListExporter({ outputPath, jsonl: false });
await jsonExporter.export(values);

// JSONL export
const jsonlExporter = new Core.GOJSONListExporter({ outputPath, jsonl: true });
await jsonlExporter.export(values);

// CSV export
const csvExporter = new Core.GOCSVListExporter({ outputPath, columns: ['id', 'name'] });
await csvExporter.export(records);

// HTML export
const htmlExporter = new Core.GOHTMLListExporter({ outputPath, title: 'Report' });
await htmlExporter.export(records);
```

### Formati di export (GOExportFormat)

Il tipo `GOExportFormat` in go-common definisce tutti i formati supportati:

```typescript
type GOExportFormat = 'txt' | 'json' | 'jsonl' | 'csv' | 'html';
```

Costanti e utility disponibili:

- `GO_EXPORT_FORMATS` — array di tutti i formati validi
- `isGOExportFormat(value)` — type guard
- `GO_EXPORT_FORMAT_EXTENSIONS` — mappa formato → estensione file

Se uno script supporta solo un sottoinsieme di formati, usa `Extract<>`:

```typescript
type MyFormat = Extract<Core.GOExportFormat, 'json' | 'csv' | 'html'>;
```

---

## Path Resolution

| Funzionalità                  | Classe go-common                        | Pattern vietati                                    |
| ----------------------------- | --------------------------------------- | -------------------------------------------------- |
| Risoluzione path input/output | `GOPaths` (`script.paths`)              | `path.resolve` / `path.isAbsolute` manuali per I/O |
| Tipo path (input/output)      | `GOPathType.INPUT`, `GOPathType.OUTPUT` | -                                                  |

```typescript
// Risoluzione path di input
const inputPath = script.paths.resolvePath(config.inputFile, Core.GOPathType.INPUT);

// Risoluzione path di output
const outputPath = script.paths.resolvePath(config.outputFile ?? `report_${Date.now()}.txt`, Core.GOPathType.OUTPUT);

// Con info aggiuntive (isRelative, resolvedPath, originalPath)
const pathInfo = script.paths.resolvePathWithInfo(config.inputFile, Core.GOPathType.INPUT);
```

I percorsi relativi vengono risolti automaticamente:

- **Input**: `data/<script>/inputs/<file>`
- **Output**: `data/<script>/outputs/<script>_<timestamp>/<file>`

---

## JSON Utilities

| Funzionalità                    | Classe go-common       | Note                                             |
| ------------------------------- | ---------------------- | ------------------------------------------------ |
| Rilevamento formato JSON/NDJSON | `GOJSONFormatDetector` | Analisi automatica per estensione e contenuto    |
| Estrazione campi da JSON        | `GOJSONFieldExtractor` | Dot-notation + ricerca ricorsiva + embedded JSON |
| Navigazione path in oggetti     | `navigateFieldPath`    | -                                                |
| Parsing path dot-notation       | `parseFieldPath`       | -                                                |
| Serializzazione sicura          | `safeJsonStringify`    | Gestisce riferimenti circolari                   |

```typescript
// Rilevamento formato
const format = await Core.GOJSONFormatDetector.detect(filePath);
// format: 'json' | 'jsonl'

// Estrazione campi
const extractor = new Core.GOJSONFieldExtractor({ parseEmbeddedJson: true });
const value = extractor.extract(jsonObject, 'user.address.city');
// Cerca prima per percorso esatto, poi ricorsivamente
```

---

## Prompts e UI

| Funzionalità               | Classe go-common | Pacchetti vietati                 |
| -------------------------- | ---------------- | --------------------------------- |
| Spinner (singolo/multiplo) | `GOMultiSpinner` | `ora`, `cli-spinners`             |
| Barra di caricamento       | `GOLoadingBar`   | -                                 |
| Prompt interattivi         | `GOPrompt`       | `prompts`, `enquirer`, `inquirer` |

```typescript
// Spinner
script.prompt.spinner.start('Caricamento...');
script.prompt.spinner.stop('Completato!');

// Multi-spinner
const multi = new Core.GOMultiSpinner();
multi.add('task1', 'Download file...');
multi.add('task2', 'Parsing dati...');
multi.succeed('task1', 'File scaricato');

// Loading bar
const bar = new Core.GOLoadingBar({ total: 100 });
bar.increment(10);
```

---

## HTTP Client

| Funzionalità   | Classe go-common | Pacchetti vietati                      |
| -------------- | ---------------- | -------------------------------------- |
| Richieste HTTP | `GOHttpClient`   | `axios`, `got`, `node-fetch`, `undici` |

```typescript
const client = new Core.GOHttpClient({ baseUrl: 'https://api.example.com' });
const response = await client.get('/endpoint');
const data = await client.post('/endpoint', { body: payload });
```

---

## Error Handling

| Funzionalità            | Classe go-common           | Note                               |
| ----------------------- | -------------------------- | ---------------------------------- |
| Errori tipizzati        | `GOError`                  | Estendi per errori custom          |
| Conversione errori      | `toError(unknown)`         | Converte qualsiasi valore in Error |
| Messaggio errore sicuro | `getErrorMessage(unknown)` | Estrae messaggio da qualsiasi tipo |
| Result pattern          | `GOResult<T, E>`           | Alternative a try/catch            |

```typescript
// Conversione sicura
try {
  await operation();
} catch (err: unknown) {
  const message = Core.getErrorMessage(err);
  script.logger.error(`Operazione fallita: ${message}`);
}

// Result pattern
const result: Core.GOResult<Data, Error> = await safeOperation();
if (result.ok) {
  // result.value
} else {
  // result.error
}
```

---

## Events

| Funzionalità            | Classe go-common     | Pattern vietati              |
| ----------------------- | -------------------- | ---------------------------- |
| Event emitter tipizzato | `GOEventEmitterBase` | `new EventEmitter()` diretto |

```typescript
// Estendi GOEventEmitterBase per eventi tipizzati
interface MyEvents {
  'data:processed': { count: number };
  'data:error': { message: string };
}

class MyProcessor extends Core.GOEventEmitterBase<MyEvents> {
  // ...
}
```

---

## AWS Services

| Funzionalità    | Classe go-common                              | Note                           |
| --------------- | --------------------------------------------- | ------------------------------ |
| Credenziali AWS | `GOAWSCredentialsManager`                     | Gestione profili e regioni     |
| Client factory  | `AWSClientProvider`, `AWSMultiClientProvider` | Creazione client tipizzata     |
| DynamoDB query  | `DynamoDBQueryService`                        | Query con paginazione          |
| SQS operations  | `AWSSQSService`                               | Send, receive, delete messaggi |

```typescript
// Client AWS
const credentials = new Core.GOAWSCredentialsManager({ profile: 'my-profile', region: 'eu-south-1' });
const clientProvider = new Core.AWSClientProvider(credentials);
const dynamoClient = clientProvider.getClient(DynamoDBClient);
```

---

## Utilities

| Funzionalità                 | Funzione go-common                | Note                                |
| ---------------------------- | --------------------------------- | ----------------------------------- |
| Conversione valore → stringa | `valueToString`                   | Gestisce tutti i tipi               |
| Serializzazione JSON sicura  | `safeJsonStringify`               | Gestisce riferimenti circolari      |
| Type guards                  | `isNonNullable`, `isString`, etc. | -                                   |
| Polling asincrono            | `pollUntilComplete`               | Con backoff configurabile           |
| Troncamento smart            | `smartTruncate`                   | Tronca stringhe lunghe con ellipsis |
| File copy                    | `GOFileCopier`                    | Copia con progress e validazione    |

---

## Riepilogo Regole ESLint

Le seguenti regole sono attive per tutti i file in `scripts/**/*.ts` (esclusi i test):

### `no-restricted-imports`

Blocca l'import di pacchetti di terze parti che duplicano funzionalità di go-common:

| Categoria | Pacchetti bloccati                          | Alternativa go-common                    |
| --------- | ------------------------------------------- | ---------------------------------------- |
| CSV       | `csv-stringify`, `csv-parse`                | `GOCSVListExporter`, `GOCSVListImporter` |
| Prompts   | `prompts`, `enquirer`, `inquirer`           | `GOPrompt`                               |
| Spinners  | `ora`, `cli-spinners`                       | `GOMultiSpinner`, `GOLoadingBar`         |
| Colori    | `chalk`, `kleur`, `picocolors`, `colorette` | `GOLogger`                               |
| HTTP      | `axios`, `got`, `node-fetch`, `undici`      | `GOHttpClient`                           |
| CLI args  | `yargs`, `commander`, `minimist`, `meow`    | `GOScript` / `GOConfigReader`            |
| Tabelle   | `cli-table3`, `table`                       | `GOTableFormatter`                       |
| Logging   | `winston`, `pino`, `bunyan`, `log4js`       | `GOLogger`                               |
| YAML      | `yaml`, `js-yaml`                           | Utilities go-common                      |

### `no-restricted-syntax`

Blocca pattern di codice che dovrebbero utilizzare go-common:

| Pattern                             | Alternativa go-common                     |
| ----------------------------------- | ----------------------------------------- |
| `fs.writeFile` / `fs.writeFileSync` | Exporters (`GOFileListExporter`, etc.)    |
| `fs.createWriteStream`              | Exporters                                 |
| `readline.createInterface`          | Importers (`GOJSONListImporter`, etc.)    |
| `process.env`                       | `GOConfigEnvProvider` / `GOScript` config |
| `new EventEmitter()`                | `GOEventEmitterBase`                      |

### Bypass

Per casi eccezionali in cui una regola non si applica:

```typescript
// eslint-disable-next-line no-restricted-imports -- Necessario per <giustificazione specifica>
import { something } from 'pacchetto-vietato';
```

La giustificazione è **obbligatoria**. Le PR senza giustificazione verranno rifiutate.

---

**Ultima modifica**: 2026-04-03
**Maintainer**: Team GO - Gestione Operativa
