# @pagopa/go-common

Il kernel condiviso degli script e dei package GO Automation: errori, utility, date, concorrenza, polling, JSON, processi, file, importer ed exporter, parser, logging, rendering e HTTP. Non dipende da nessun altro package del monorepo.

## Installazione

Il package è pubblicato su **GitHub Packages** dell'organizzazione `pagopa`. Nel repository che lo usa serve un `.npmrc`:

```ini
@pagopa:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

- **In locale:** un PAT _classic_ con `read:packages`, autorizzato SSO per l'organizzazione `pagopa`, esportato come `NODE_AUTH_TOKEN`.
- **In GitHub Actions:** `permissions: { packages: read }` e `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`. Il repository consumatore va abilitato in _Package settings → Manage Actions access_.

Richiede Node.js `>=22.19.0` ed è solo ESM.

```bash
pnpm add @pagopa/go-common
```

## Sottopercorsi

Non c'è un import dalla radice: ogni area ha il suo sottopercorso, e un sottopercorso carica solo le proprie dipendenze di terze parti. Nessun sottopercorso richiede dipendenze peer.

| Sottopercorso                   | Contenuto                                                                        | Dipendenze di terze parti caricate |
| ------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------- |
| `@pagopa/go-common/errors`      | `GOError`, `GOResult` e helper sugli errori                                      | nessuna                            |
| `@pagopa/go-common/events`      | `GOEventEmitterBase`, `GOEventEmitter`                                           | nessuna                            |
| `@pagopa/go-common/utils`       | `valueToString`, `safeJsonStringify`, `parseInteger`, `omitUndefined`, …         | nessuna                            |
| `@pagopa/go-common/dates`       | durate, formattazione e parsing di date                                          | `luxon`                            |
| `@pagopa/go-common/concurrency` | `GOConcurrencyPool`, `GORateLimiter`                                             | nessuna                            |
| `@pagopa/go-common/polling`     | `GOBackoff`, sleeper, errori di polling                                          | nessuna                            |
| `@pagopa/go-common/json`        | `canonicalizeJson`, percorsi di campo, estrazione e rilevamento del formato JSON | nessuna                            |
| `@pagopa/go-common/process`     | `GOChildProcess`                                                                 | nessuna                            |
| `@pagopa/go-common/security`    | controllo delle chiavi pericolose (`__proto__`, …)                               | nessuna                            |
| `@pagopa/go-common/analysis`    | `GOThresholdEvaluator`                                                           | nessuna                            |
| `@pagopa/go-common/files`       | `GOFileCopier`, tipi di percorso (`GOPathType`)                                  | nessuna                            |
| `@pagopa/go-common/importers`   | importer di liste (CSV, JSON, …)                                                 | `csv-parse`                        |
| `@pagopa/go-common/exporters`   | exporter di liste (CSV, JSON, HTML, …)                                           | `csv-stringify`                    |
| `@pagopa/go-common/parsers`     | parser `.env` e YAML                                                             | `yaml`                             |
| `@pagopa/go-common/logging`     | `GOLogger`, handler e redazione dei dati sensibili                               | `luxon`, `string-width`            |
| `@pagopa/go-common/render`      | tabelle, alberi, colori della console                                            | `string-width`                     |
| `@pagopa/go-common/http`        | `GOHttpClient`, download di file                                                 | `undici`                           |

## Esempio

```typescript
import { GOLogger } from '@pagopa/go-common/logging';
import { valueToString } from '@pagopa/go-common/utils';

const logger = new GOLogger();
logger.info(valueToString({ status: 'ok' }));
```

## Documentazione

- Guida d'uso: [docs/GOCOMMON.md](../../docs/GOCOMMON.md).
- Superficie pubblica di ogni sottopercorso: cartella [`api/`](api/) (report generato).
- Controlli prima della pubblicazione (report API, smoke test, budget di import): [docs/PUBLISHED_PACKAGES_CHECKS.md](../../docs/PUBLISHED_PACKAGES_CHECKS.md).
- Modifiche tra le versioni: `CHANGELOG.md`, creato al primo rilascio.

## Test e build

```bash
pnpm --filter=@pagopa/go-common test
pnpm --filter=@pagopa/go-common build
```
