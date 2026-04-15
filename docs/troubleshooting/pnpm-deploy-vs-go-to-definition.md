# Conflitto tra pnpm deploy e VSCode "Go to Definition"

> **Problema**: In un monorepo pnpm con TypeScript, esiste un conflitto tra la funzionalità `pnpm deploy` e la navigazione del codice in VSCode.

**Data**: Gennaio 2026
**Versioni**: pnpm 10.x, TypeScript 5.x, Node.js 20+

---

## Indice

1. [Descrizione del Problema](#descrizione-del-problema)
2. [Causa Tecnica](#causa-tecnica)
3. [Tentativi Falliti](#tentativi-falliti)
4. [Soluzione Finale](#soluzione-finale)
5. [Problema Secondario: \_\_dirname in ES Modules](#problema-secondario-__dirname-in-es-modules)
6. [Configurazione Finale](#configurazione-finale)
7. [Riferimenti](#riferimenti)

---

## Descrizione del Problema

In un monorepo pnpm con workspace packages (es. `@go-automation/go-common`), ci sono due requisiti che entrano in conflitto:

### Requisito 1: pnpm deploy funzionante

A partire da **pnpm v10**, il comando `pnpm deploy` richiede l'opzione `inject-workspace-packages=true` nel file `.npmrc`. Questa opzione fa si che i pacchetti workspace vengano **copiati** in `node_modules` invece di essere collegati tramite symlink.

### Requisito 2: VSCode "Go to Definition" funzionante

La funzionalità "Go to Definition" (F12 o Cmd+Click) di VSCode deve navigare direttamente ai **file sorgente** in `packages/go-common/src/`, non ai file compilati o alle copie in `node_modules`.

### Il Conflitto

| Configurazione                                | pnpm deploy                                      | Go to Definition                                     |
| --------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------- |
| `inject-workspace-packages=true`              | Funziona                                         | **NON funziona** - naviga a `node_modules/.pnpm/...` |
| `inject-workspace-packages=false` (o assente) | **NON funziona** - errore `ERR_MODULE_NOT_FOUND` | Funziona - naviga a `packages/`                      |

---

## Causa Tecnica

### Perche inject-workspace-packages rompe "Go to Definition"

Quando `inject-workspace-packages=true` e attivo:

1. pnpm **copia** i pacchetti workspace in `node_modules/.pnpm/`
2. VSCode/TypeScript risolve i moduli seguendo il percorso fisico
3. I file `.d.ts` e le `declarationMap` puntano alla copia, non ai sorgenti originali
4. "Go to Definition" porta a `node_modules/.pnpm/@go-automation+go-common@.../...` invece di `packages/go-common/src/`

### Perche senza inject il deploy fallisce

Senza `inject-workspace-packages=true`:

1. pnpm usa **symlink** per i pacchetti workspace
2. Durante `pnpm deploy`, i symlink non vengono risolti correttamente
3. Il bundle deployato non trova il pacchetto workspace
4. Errore: `Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@go-automation/go-common'`

---

## Tentativi Falliti

Durante la risoluzione del problema, sono stati provati diversi approcci che **NON hanno funzionato**:

### 1. Aggiungere paths mapping in tsconfig.json

```json
// tsconfig.base.json - NON FUNZIONA
{
  "compilerOptions": {
    "paths": {
      "@go-automation/go-common": ["./packages/go-common/src/index.ts"],
      "@go-automation/go-common/*": ["./packages/go-common/src/*"]
    }
  }
}
```

**Risultato**: TypeScript compila correttamente ma VSCode continua a navigare a `node_modules`.

### 2. Modificare exports/types in package.json di go-common

```json
// packages/go-common/package.json - NON FUNZIONA
{
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./dist/index.js"
    }
  }
}
```

**Risultato**: Causa problemi di compilazione e non risolve il problema di navigazione.

### 3. Combinare link-workspace-packages con inject

```ini
# .npmrc - NON FUNZIONA
inject-workspace-packages=true
link-workspace-packages=deep
```

**Risultato**: Le due opzioni sono in conflitto. `inject` sovrascrive il comportamento di `link`.

### 4. Verificare declarationMap

```json
// tsconfig.base.json - GIA' ABILITATO
{
  "compilerOptions": {
    "declarationMap": true
  }
}
```

**Risultato**: `declarationMap` era gia abilitato. Il problema e che le mappe puntano alla copia in `node_modules`, non ai sorgenti.

---

## Soluzione Finale

La soluzione e usare `force-legacy-deploy=true` invece di `inject-workspace-packages=true`.

### Cosa fa force-legacy-deploy

Questa opzione forza pnpm a usare l'**implementazione legacy** del comando deploy, che:

- Funziona correttamente con i symlink dei workspace packages
- Non richiede `inject-workspace-packages`
- Mantiene i symlink intatti per lo sviluppo locale

### Configurazione .npmrc

```ini
# .npmrc

# NON usare inject-workspace-packages (causa problemi con Go to Definition)
# inject-workspace-packages=true

# Usare invece force-legacy-deploy per pnpm deploy
force-legacy-deploy=true
```

### Warning Atteso

Con questa configurazione, eseguendo `pnpm deploy` vedrai un warning:

```
Shared workspace lockfile detected but configuration forces legacy deploy implementation
```

**Questo warning e normale e puo essere ignorato**. Il deploy funzionera correttamente.

---

## Problema Secondario: \_\_dirname in ES Modules

Durante i test, e emerso un problema correlato con `__dirname` non definito in produzione.

### Il Problema

Quando un pacchetto usa `"type": "module"` in `package.json`:

| Ambiente                     | `__dirname`         | `__filename`        |
| ---------------------------- | ------------------- | ------------------- |
| CommonJS                     | Definito            | Definito            |
| ES Modules con `tsx` (dev)   | Polyfill automatico | Polyfill automatico |
| ES Modules con `node` (prod) | **undefined**       | **undefined**       |

Questo causa errori come:

```
ReferenceError: __dirname is not defined in ES module scope
```

### Soluzione Vecchia (Node.js < 20.11)

```typescript
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
```

### Soluzione Moderna (Node.js 20.11+)

A partire da Node.js 20.11, sono disponibili nuove proprieta su `import.meta`:

```typescript
// Nuovo modo - piu semplice e pulito
const currentDir = import.meta.dirname; // equivalente a __dirname
const currentFile = import.meta.filename; // equivalente a __filename
```

**Vantaggi**:

- Sintassi piu concisa
- Non richiede import aggiuntivi
- Comportamento coerente con CommonJS

---

## Configurazione Finale

### .npmrc

```ini
# Abilita pre/post scripts
enable-pre-post-scripts=true

# Auto install peer dependencies
auto-install-peers=true

# Non essere strict con i peer dependencies
strict-peer-dependencies=false

# Non usare shamefully-hoist
shamefully-hoist=false

# Hoist AWS SDK per evitare duplicati
public-hoist-pattern[]=*aws-sdk*

# IMPORTANTE: NON usare inject-workspace-packages
# Rompe "Go to Definition" in VSCode
# inject-workspace-packages=true

# Usare force-legacy-deploy per far funzionare pnpm deploy
# con i symlink dei workspace packages
force-legacy-deploy=true
```

### Esempio di utilizzo di import.meta.dirname

```typescript
// Prima (compatibile con Node.js < 20.11)
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, 'config.json');

// Dopo (Node.js 20.11+)
const configPath = path.join(import.meta.dirname, 'config.json');
```

---

## Riferimenti

- **pnpm deploy documentation**: https://pnpm.io/cli/deploy
- **Discussione sulla nuova modalità deploy**: https://github.com/orgs/pnpm/discussions/9015
- **Issue su inject-workspace-packages**: https://github.com/pnpm/pnpm/issues/8975
- **import.meta.dirname in Node.js**: https://nodejs.org/api/esm.html#importmetadirname

---

## Riepilogo

| Problema                                   | Soluzione                                    |
| ------------------------------------------ | -------------------------------------------- |
| `pnpm deploy` non funziona                 | Usare `force-legacy-deploy=true`             |
| "Go to Definition" naviga a `node_modules` | Rimuovere `inject-workspace-packages=true`   |
| `__dirname is not defined` in ES Modules   | Usare `import.meta.dirname` (Node.js 20.11+) |
| Warning "legacy deploy implementation"     | Ignorare, e comportamento atteso             |
