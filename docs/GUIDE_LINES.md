# Coding Guidelines

> Standard di codifica e best practices per il progetto GO Automation.
> Basato su [Google TypeScript Style Guide](https://ts.dev/style/).

## Indice

1. [Principi Fondamentali](#principi-fondamentali)
2. [Naming Conventions](#naming-conventions)
3. [Type System](#type-system)
4. [Organizzazione File](#organizzazione-file)
5. [Import/Export](#importexport)
6. [Funzioni e Metodi](#funzioni-e-metodi)
7. [Classi](#classi)
8. [Control Flow](#control-flow)
9. [Iterazione](#iterazione)
10. [Performance](#performance)
11. [Programmazione Funzionale](#programmazione-funzionale)
12. [Documentazione JSDoc](#documentazione-jsdoc)
13. [Pattern Proibiti](#pattern-proibiti)
14. [Pattern Raccomandati](#pattern-raccomandati)
15. [TypeScript Strict Configuration](#typescript-strict-configuration)

---

## Principi Fondamentali

### Performance First

- Scegli sempre algoritmi O(N) invece di O(N^2)
- Usa `Map`/`Set` per lookups invece di `Array.find()`/`Array.includes()`
- Compila RegExp una volta, riutilizza piu volte
- Preferisci iterazioni single-pass su multiple passes
- Usa `readonly` per evitare copie difensive

### Immutabilita

- Usa `readonly` per proprieta che non cambiano
- Crea nuovi oggetti invece di mutare quelli esistenti
- Usa `readonly` nei parametri delle funzioni
- Preferisci `const` a `let`

### Type Safety

- Evita `any` - usa `unknown` e type guards
- Abilita strict mode completo
- Documenta le asserzioni di tipo con commenti

---

## Naming Conventions

### Identificatori

| Identificatore                 | Convenzione            | Esempi                            |
| ------------------------------ | ---------------------- | --------------------------------- |
| Classi, Interfacce, Tipi       | `UpperCamelCase`       | `AlarmAnalyzer`, `FilteredAlarms` |
| Variabili, Funzioni, Parametri | `lowerCamelCase`       | `alarmCount`, `processData`       |
| Costanti, Enum Values          | `CONSTANT_CASE`        | `MAX_RETRIES`, `DEFAULT_TIMEOUT`  |
| Campi privati                  | `lowerCamelCase`       | `private items` (NON `_items`)    |
| Type parameters                | `T` o `UpperCamelCase` | `T`, `TKey`, `TValue`             |

### Abbreviazioni

Tratta le abbreviazioni come parole normali:

```typescript
// CORRETTO
loadHttpUrl();
parseXmlDocument();
userId: string;

// SBAGLIATO
loadHTTPURL();
parseXMLDocument();
userID: string;
```

---

## Type System

### Primitivi vs Wrapper

```typescript
// CORRETTO: Usa primitivi
const name: string = 'John';
const count: number = 42;
const active: boolean = true;

// SBAGLIATO: Non usare classi wrapper
const name: String = new String('John');
const count: Number = new Number(42);
```

### Evita `any` - Usa `unknown`

```typescript
// CORRETTO: unknown + type guard
function parseJson(data: string): unknown {
  return JSON.parse(data);
}

const result = parseJson(input);
if (isValidConfig(result)) {
  console.log(result.apiUrl);
}

// SBAGLIATO: any
function parseJsonBad(data: string): any {
  return JSON.parse(data);
}
```

### Array Types

```typescript
// CORRETTO: Tipi semplici
const items: string[] = [];
const numbers: number[] = [];

// CORRETTO: Tipi complessi
const mapped: Array<string | number> = [];
const nested: Array<readonly Item[]> = [];

// SBAGLIATO: Constructor Array
const items = new Array<string>();
```

### Interfacce vs Type Aliases

```typescript
// CORRETTO: Interface per oggetti
interface User {
  readonly name: string;
  readonly email: string;
}

// SBAGLIATO: Type per oggetti
type User = {
  name: string;
  email: string;
};

// CORRETTO: Type per unions/intersections
type Status = 'active' | 'inactive' | 'pending';
type ID = string | number;
```

### Null e Undefined

```typescript
// CORRETTO: Proprieta opzionali
interface Config {
  readonly apiUrl: string;
  readonly timeout?: number; // Opzionale
}

// SBAGLIATO: | undefined nel tipo
interface Config {
  apiUrl: string;
  timeout: number | undefined;
}
```

---

## Organizzazione File

### Un Tipo per File

```typescript
// CORRETTO: Un file per tipo
// types/User.ts
export interface User { ... }

// types/Product.ts
export interface Product { ... }

// types/Status.ts
export type Status = 'active' | 'inactive';

// SBAGLIATO: Multipli tipi in un file
// types/types.ts
export interface User { ... }
export interface Product { ... }
export type Status = 'active' | 'inactive';
```

### Naming dei File

| Tipo              | Convenzione | Esempio                       |
| ----------------- | ----------- | ----------------------------- |
| Classi/Interfacce | PascalCase  | `User.ts`, `ConfigManager.ts` |
| Index files       | lowercase   | `index.ts`                    |
| Config files      | lowercase   | `config.json`, `config.yaml`  |

---

## Import/Export

### Sempre Named Exports

```typescript
// CORRETTO: Named exports
export class AlarmAnalyzer { ... }
export interface FilteredAlarms { ... }
export function processAlarms() { ... }

// SBAGLIATO: Default export
export default class AlarmAnalyzer { ... }
```

### Pattern di Import

```typescript
// CORRETTO: Module import per API grandi
import * as fs from 'fs/promises';

// CORRETTO: Destructuring per item specifici
import { AlarmAnalyzer, FilteredAlarms } from './types/FilteredAlarms';

// CORRETTO: Rename solo per collisioni
import { User as ApiUser } from './api/User';
import { User as DbUser } from './db/User';
```

---

## Funzioni e Metodi

### Dichiarazione Funzioni

```typescript
// CORRETTO: Function declaration per funzioni named
function processData(items: readonly Item[]): Result {
  return items.map(transform);
}

// CORRETTO: Arrow function in espressioni
const handler = (event: Event): void => {
  console.log(event);
};

// SBAGLIATO: function keyword in espressioni
const handler = function(event: Event): void { ... };
```

### Return Types

```typescript
// CORRETTO: Tipi espliciti per API pubbliche
export function analyze(data: Data): AnalysisResult {
  // Il tipo aiuta a catturare errori
}

// OK: Ometti per tipi banalmente inferibili
function add(a: number, b: number) {
  return a + b; // Ovviamente ritorna number
}
```

---

## Classi

### Parameter Properties

```typescript
// CORRETTO: Parameter properties
class Service {
  constructor(
    private readonly client: HttpClient,
    private readonly logger: Logger,
  ) {}
}

// VERBOSE: Assegnazione manuale
class Service {
  private readonly client: HttpClient;
  private readonly logger: Logger;

  constructor(client: HttpClient, logger: Logger) {
    this.client = client;
    this.logger = logger;
  }
}
```

### Visibility Modifiers

```typescript
// CORRETTO
class Analyzer {
  private readonly cache = new Map();

  public analyze(data: Data): Result {
    return this.processInternal(data);
  }

  private processInternal(data: Data): Result {
    // Implementazione privata
  }
}
```

### Readonly Properties

```typescript
// CORRETTO: readonly per proprieta immutabili
class Config {
  readonly apiUrl: string;
  readonly timeout: number;

  constructor(url: string, timeout: number) {
    this.apiUrl = url;
    this.timeout = timeout;
  }
}
```

---

## Control Flow

### Switch con Default

```typescript
// CORRETTO: Ha default case
switch (status) {
  case 'active':
    return handleActive();
  case 'inactive':
    return handleInactive();
  default:
    throw new Error(`Unknown status: ${status}`);
}

// SBAGLIATO: No default
switch (status) {
  case 'active':
    return handleActive();
  case 'inactive':
    return handleInactive();
}
```

### Operatori di Uguaglianza

```typescript
// CORRETTO: === e !==
if (value === null) { ... }
if (count !== 0) { ... }

// CORRETTO: == per null/undefined check
if (value == null) {  // Controlla sia null che undefined
  // ...
}

// SBAGLIATO: == per altri casi
if (value == 5) { ... }
```

---

## Iterazione

### for...of invece di forEach

```typescript
// CORRETTO: for...of
for (const item of items) {
  console.log(item);
}

// SBAGLIATO: forEach
items.forEach((item) => console.log(item));
```

### Mai for...in su Array

```typescript
// CORRETTO: for...of per arrays
for (const item of items) {
  console.log(item);
}

// SBAGLIATO: for...in su arrays
for (const index in items) {
  console.log(items[index]);
}
```

### Iterazione Oggetti Sicura

```typescript
// CORRETTO: Object.keys/entries
for (const key of Object.keys(obj)) {
  console.log(obj[key]);
}

for (const [key, value] of Object.entries(obj)) {
  console.log(key, value);
}

// SBAGLIATO: for...in senza hasOwnProperty
for (const key in obj) {
  console.log(obj[key]); // Non sicuro!
}
```

---

## Performance

### Usa Map per Lookups

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

### Compila RegExp Una Volta

```typescript
// CORRETTO: Compila una volta
const patterns = ignoreList.map((p) => new RegExp(p, 'i'));

function matches(text: string): boolean {
  return patterns.some((regex) => regex.test(text));
}

// SBAGLIATO: Ricompila ogni volta
function matches(text: string, ignoreList: string[]): boolean {
  return ignoreList.some((p) => new RegExp(p, 'i').test(text));
}
```

### Usa Set per Membership Check

```typescript
// CORRETTO: O(1) lookup
const validIds = new Set(['a', 'b', 'c']);
if (validIds.has(id)) { ... }

// SBAGLIATO: O(N) lookup
const validIds = ['a', 'b', 'c'];
if (validIds.includes(id)) { ... }
```

---

## Programmazione Funzionale

### Pure Functions

```typescript
// CORRETTO: Funzione pura
function calculateTotal(items: readonly Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

// SBAGLIATO: Side effects
let total = 0;
function addToTotal(item: Item): void {
  total += item.price; // Side effect!
}
```

### Immutable Updates

```typescript
// CORRETTO: Crea nuovo oggetto
function addItem(state: State, item: Item): State {
  return {
    ...state,
    items: [...state.items, item],
  };
}

// SBAGLIATO: Mutazione
function addItem(state: State, item: Item): State {
  state.items.push(item); // Mutazione!
  return state;
}
```

### Readonly Parameters

```typescript
// CORRETTO: readonly per prevenire mutazioni
function processAlarms(alarms: readonly Alarm[]): readonly ProcessedAlarm[] {
  return alarms.filter((alarm) => alarm.severity === 'high').map((alarm) => ({ ...alarm, processed: true }));
}

// SBAGLIATO: Mutazioni interne
function processAlarms(alarms: Alarm[]): Alarm[] {
  for (const alarm of alarms) {
    if (alarm.severity === 'high') {
      alarm.processed = true; // Mutazione!
    }
  }
  return alarms;
}
```

---

## Documentazione JSDoc

### Funzioni Pubbliche

````typescript
/**
 * Filtra gli allarmi in base ai pattern di ignore
 * Complexity: O(N) dove N e il numero di allarmi
 *
 * @param alarms - Array di allarmi da filtrare
 * @param patterns - Pattern di ignore da applicare
 * @returns Allarmi filtrati divisi in ignored e not ignored
 *
 * @example
 * ```typescript
 * const result = filterAlarms(alarms, ['test', 'dev']);
 * console.log(result.notIgnored.length);
 * ```
 */
export function filterAlarms(alarms: readonly Alarm[], patterns: readonly string[]): FilteredAlarms {
  // Implementation
}
````

### Classi

```typescript
/**
 * Analizzatore di allarmi CloudWatch
 *
 * Fornisce utilities per:
 * - Raggruppare allarmi per metrica
 * - Filtrare per pattern
 * - Generare report
 */
export class AlarmAnalyzer {
  /**
   * Crea un nuovo analizzatore
   *
   * @param config - Configurazione dell'analizzatore
   */
  constructor(config: AnalyzerConfig) {
    // ...
  }
}
```

---

## Pattern Proibiti

```typescript
// NEVER: namespace
namespace Utils { ... }  // Usa moduli!

// NEVER: require()
const fs = require('fs');  // Usa import ES6!

// NEVER: @ts-ignore
// @ts-ignore
const value = dangerousOperation();  // Risolvi il type issue!

// NEVER: any senza giustificazione
function process(data: any) { ... }  // Usa unknown!

// NEVER: Non-null assertion senza commento
const value = maybeUndefined!;  // Spiega perche e safe!

// CORRETTO: Con commento
const value = maybeUndefined!;  // Safe: validato nel check precedente

// NEVER: var
var count = 0;  // Usa const o let!

// NEVER: Array constructor
const items = new Array<string>();  // Usa literal!

// NEVER: for...in su arrays
for (const i in array) { ... }  // Usa for...of!

// NEVER: Function constructor
const fn = new Function('a', 'b', 'return a + b');  // Pericoloso!
```

---

## Pattern Raccomandati

### Type Guards

```typescript
function isError(value: unknown): value is Error {
  return value instanceof Error;
}

function isUser(obj: unknown): obj is User {
  return typeof obj === 'object' && obj !== null && 'id' in obj && 'name' in obj;
}
```

### Branded Types

```typescript
type ValidatedEmail = string & { __brand: 'ValidatedEmail' };

function validateEmail(email: string): ValidatedEmail {
  if (!email.includes('@')) {
    throw new Error('Invalid email');
  }
  return email as ValidatedEmail;
}
```

### Const Assertions

```typescript
const config = {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
} as const;

// Type: { readonly apiUrl: "https://api.example.com"; readonly timeout: 5000 }
```

### Deep Readonly

```typescript
type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

function freeze<T>(obj: T): DeepReadonly<T> {
  return Object.freeze(obj) as DeepReadonly<T>;
}
```

---

## TypeScript Strict Configuration

### tsconfig.base.json

```json
{
  "compilerOptions": {
    // Strict Type Checking
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "useUnknownInCatchVariables": true,

    // Additional Strict Checks
    "noUncheckedIndexedAccess": true,
    "noPropertyAccessFromIndexSignature": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "allowUnreachableCode": false,
    "allowUnusedLabels": false,

    // Unused Code Detection
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

### noUncheckedIndexedAccess

Con questa opzione abilitata, l'accesso agli array include `undefined`:

```typescript
const items = [1, 2, 3];
const first = items[0]; // Type: number | undefined

// Gestione corretta
if (items.length > 0) {
  const first = items[0]!; // Safe: verificato che esiste
}

// Oppure optional chaining
const first = items[0];
if (first !== undefined) {
  // usa first
}

// Oppure at() con fallback
const first = items.at(0) ?? defaultValue;
```

---

## Checklist Rapida

- [ ] File tipi in PascalCase (es. `User.ts`)
- [ ] Un solo tipo/interfaccia per file
- [ ] JSDoc su tutte le funzioni pubbliche
- [ ] Nessun `any` senza giustificazione
- [ ] Usa `readonly` per immutabilita
- [ ] Performance ottimizzata (Map/Set per lookups)
- [ ] Named exports (no default exports)
- [ ] `for...of` invece di `forEach`
- [ ] Build passa senza errori
- [ ] Nessun `@ts-ignore` o type assertions non giustificati

---

## Riferimenti

- [Google TypeScript Style Guide](https://ts.dev/style/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Architettura Monorepo](ARCHITECTURE.md)
- [Documentazione go-common](GOCOMMON.md)

---

**Ultima modifica**: 2026-01-21
**Maintainer**: Team GO - Gestione Operativa
