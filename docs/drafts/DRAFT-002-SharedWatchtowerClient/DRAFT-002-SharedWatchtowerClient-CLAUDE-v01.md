# DRAFT-002 — Client Watchtower condiviso da go-watchtower-pro

- **Stato**: aperta
- **Autore**: CLAUDE
- **Data**: 2026-11-18
- **Origine**: osservazione del committente: go-watchtower-pro ha già un package `client` usato per parlare con
  Watchtower; pubblicato su GitHub Packages, renderebbe inutile `go-watchtower-client` in go-automation.
- **Collegata a**: [DRAFT-001 — Rimozione della catena execute-runbook](../DRAFT-001-ExecuteRunbookRemoval/DRAFT-001-ExecuteRunbookRemoval-CLAUDE-v01.md)

## 1. Perché

Oggi go-automation tiene una copia dell'OpenAPI di Watchtower e ne genera un client proprio
(`@go-automation/go-watchtower-client`). Il contratto lo possiede però chi espone l'API. Se go-watchtower-pro pubblica
il suo client, go-automation lo importa come dipendenza: niente copie dell'OpenAPI, niente codice generato da tenere
allineato, e un cambio di API arriva come una versione nuova del package.

## 2. Che cosa sappiamo

Verificato sul codice il 2026-11-18.

### 2.1 Il client di oggi in go-automation

`packages/go-watchtower-client` è generato con `openapi-typescript` e `json2ts` dall'OpenAPI del **vecchio**
go-watchtower (`contracts/runbook-automation/v1/upstream/go-watchtower`), non da go-watchtower-pro. Lo usano:

- `go-execute-runbook`, per i metodi di scrittura (vedi DRAFT-001);
- `go-rta-check` e `go-watchtower-runbook`, in sola lettura: `login`, `listProducts`, `listProductAlarms`,
  `listProductEnvironments`, `listAlarmEvents`, `countAlarmEvents`, `getAnalysis`, `getShadowReport`,
  `getProductCensus`, `listIgnoreReasons`.

### 2.2 Il client di go-watchtower-pro

`packages/client` in go-watchtower-pro:

- nome `@watchtower/client`, `private`, versione `0.0.0`;
- dipende da `@watchtower/shared` (anch'esso `private`), che importa a ogni chiamata
  (`@watchtower/shared/features/...`, schemi zod), e da `zod`;
- ESM, pubblica solo `dist/`, `exports` con `.` e `./*`.

Copertura rispetto a ciò che go-automation usa:

| Chiamata in go-automation                                      | In `@watchtower/client`                                  |
| -------------------------------------------------------------- | -------------------------------------------------------- |
| `login`                                                        | c'è (`auth`)                                             |
| `listProducts`, `listProductAlarms`, `listProductEnvironments` | c'è (`products`, `alarms`, `environments`)               |
| `listAlarmEvents`, `countAlarmEvents`                          | non uguale: c'è `alarmOccurrences`, con un altro modello |
| `getAnalysis`, `getShadowReport`                               | manca: nessuna chiamata su analisi o shadow              |
| `getProductCensus`, `listIgnoreReasons`                        | manca                                                    |

### 2.3 Compatibilità dei moduli

I due repository sono configurati allo stesso modo, quindi non c'è niente da allineare:

|                               | go-automation           | go-watchtower-pro       |
| ----------------------------- | ----------------------- | ----------------------- |
| `"type"` dei package          | `module` (ESM)          | `module` (ESM)          |
| `module` / `moduleResolution` | `NodeNext` / `NodeNext` | `NodeNext` / `NodeNext` |
| `target`                      | `ES2025`                | `ES2025`                |
| `verbatimModuleSyntax`        | `true`                  | `true`                  |
| TypeScript                    | 6.0.3                   | 6.0.3                   |

ESM è il formato dei moduli (`import`/`export`, dichiarato con `"type": "module"`). `NodeNext` è l'impostazione di
TypeScript che segue le regole di Node: legge `"type"` di ogni package, rispetta `exports` e chiede l'estensione `.js`
negli import relativi. Un package ESM compilato con `NodeNext` è la combinazione consigliata per librerie e servizi
Node.

## 3. L'idea

### 3.1 Lato go-watchtower-pro

- Rinominare i package con lo scope `@pagopa/*`, obbligatorio su GitHub Packages dell'org `pagopa`: per esempio
  `@pagopa/watchtower-client` e `@pagopa/watchtower-shared`.
- Pubblicare anche `shared`, oppure includerlo nel bundle del client.
- Aggiungere il meccanismo di rilascio (changesets, versioni, publish con il `GITHUB_TOKEN`), come in go-automation.

### 3.2 Lato go-automation

Si elimina:

- `packages/go-watchtower-client` per intero (generato, auth, `watchtowerErrorReason`, test, test double);
- `contracts/runbook-automation/v1/upstream/go-watchtower`. Con DRAFT-001 già fatta, sparisce tutta la cartella
  `contracts/`;
- le devDependency `openapi-typescript` e `json2ts`, se non le usa nessun altro, e lo script `generate`;
- i riferimenti in `tsconfig.json`, `knip.config.ts`, `eslint.config.mjs` e nella documentazione.

Si aggiunge:

- un `.npmrc` con `@pagopa:registry=https://npm.pkg.github.com` e un token `read:packages`, in locale e in CI, per
  installare un package `@pagopa/*` che non sta nel workspace;
- la dipendenza dal client pubblicato in `go-rta-check` e `go-watchtower-runbook`, portati sulla nuova API
  (`alarmOccurrences` al posto degli alarm event, e le chiamate oggi mancanti).

## 4. Che cosa manca per farla

1. go-watchtower-pro espone le API che oggi mancano nel suo client: analisi, report shadow, censimento del prodotto,
   motivi di ignore. Probabilmente arrivano con la parte delle automazioni.
2. go-watchtower-pro pubblica client e shared su GitHub Packages con scope `@pagopa/*`.
3. go-watchtower-pro è il Watchtower in esercizio, o lo è almeno per gli strumenti di go-automation che lo
   interrogano.

## 5. Domande aperte

- **Q1**: `shared` si pubblica come package a sé, o si include nel bundle del client? Pubblicarlo espone a
  go-automation anche gli schemi zod, che potrebbero servire per validare; includerlo tiene una sola dipendenza.
- **Q2**: con quali nomi? `@pagopa/watchtower-client` e `@pagopa/watchtower-shared`, o con il prefisso `go-` come i
  package di go-automation?
- **Q3**: `go-rta-check` confronta i runbook con le analisi manuali del vecchio Watchtower. Sulla nuova API ha ancora
  senso così, o cambia scopo?
