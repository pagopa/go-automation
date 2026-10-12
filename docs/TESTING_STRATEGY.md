# Testing Strategy

Questo documento descrive come il monorepo esegue i test oggi: runner, convenzioni
di coverage, cosa gira in CI e lo stile di mocking in uso. Non è un obiettivo da
raggiungere — è lo stato reale, incluso dove la copertura è più stretta di quanto
il nome degli script suggerisca.

## Test Runner e Convenzioni

Il runner è **`node --test`**, caricato via `tsx/esm` per eseguire `.ts` senza
build preventiva:

```bash
node --import tsx/esm --test 'src/**/__tests__/**/*.test.ts'
```

Questo comando (o una sua variante) è lo script `test` di ogni workspace che ne
ha uno: `packages/*` (incluso `go-cli`), `scripts/go/*`, `scripts/send/*`,
`scripts/aws/*`, `functions/go-ExecuteRunbookLambda`,
`infra/watchtower-alarm-analysis`. I test vivono accanto al codice, sotto
`src/**/__tests__/`, con suffisso `.test.ts`. Non c'è un secondo runner: niente
`vitest`, nessun file `.spec.ts` in tutto il repo — `node --test` è l'unico.

**Eccezioni allo script base:**

- `packages/go-watchtower-runbook`, `scripts/go/go-execute-runbook` e
  `scripts/go/go-rta-check` anteponono un build step:
  `pnpm --filter=@go-automation/go-runbook build && node --import tsx/esm --test ...`.
  Dipendono da `go-runbook` compilato, non dai suoi sorgenti TypeScript.
- `bins/` non sono package pnpm del workspace (non hanno `package.json` nel
  grafo `references[]`): dove hanno test, usano glob più permissivi e un
  proprio comando, invocato a mano — non sono raggiunti da `pnpm test` né da
  nessun job CI.

## Coverage

Il meccanismo è `--experimental-test-coverage` di `node:test`, con soglie
passate come flag:

```bash
--test-coverage-lines=${GO_COVERAGE_LINES_THRESHOLD:-90}
--test-coverage-branches=${GO_COVERAGE_BRANCHES_THRESHOLD:-80}
--test-coverage-functions=${GO_COVERAGE_FUNCTIONS_THRESHOLD:-90}
```

90% linee, 80% branch, 90% funzioni — overridabili via le tre env var, mai
abbassate silenziosamente. **Attenzione al meccanismo di
`--test-coverage-include='src/**/*.ts'`**: filtra l'insieme dei file che
`node --test` ha effettivamente **caricato** nel corso della suite, non forza
dentro al denominatore i file che nessun test importa, direttamente o
transitivamente. Un file sorgente nuovo che nessun test tocca non abbassa la
percentuale: semplicemente non compare nel report, come se non esistesse. La
soglia misura quanto è testato ciò che viene testato, non quanto del pacchetto
è coperto — un package con metà dei file privi di qualunque import da un test
può comunque leggere 100% linee.

**Scope reale, dichiarato esplicitamente perché più stretto di "tutto il
monorepo":** solo **3** workspace hanno uno script `test:coverage` —
`packages/go-common`, `scripts/go/go-report-alarms`,
`scripts/aws/aws-schedule-eventbridge`. Lo script root:

```bash
pnpm test:coverage   # = pnpm test:common:coverage && pnpm test:scripts:coverage
```

non invoca `test:packages:coverage` (esiste come script ma non è mai chiamato
da `test:coverage`), e non ha equivalente per `test:runbooks` o
`test:functions`/`test:infra`. `test:scripts:coverage` è un
`pnpm -r --filter='./scripts/**' test:coverage`: un workspace sotto
`scripts/` senza quello script viene **saltato in silenzio**, non fallisce.
Delle 24 package `scripts/{go,send,aws,interop}` (esclusa `scripts/aws/cfn`,
che non ha un proprio `package.json` e non è un workspace pnpm), 17 non hanno
nemmeno uno script `test`: zero test file. Delle 5 Lambda in `functions/`,
solo `go-ExecuteRunbookLambda` ha `test`; nessuna ha `test:coverage`.

In pratica: la cifra "90/80/90" è vera dove si applica, ma si applica solo ai
tre workspace sopra. Un nuovo package che vuole il gate di coverage deve
aggiungere il proprio script `test:coverage` con lo stesso pattern — copiarlo da
uno dei tre è la via più rapida, e `pnpm go new` + `go-cli` scaffoldano già
`test`/`test:coverage` nella forma corretta per i nuovi script.

## CI

`.github/workflows/ci.yml` ha due job rilevanti ai test, entrambi bloccanti su
`ci-success` (il job di summary su cui punta la branch protection):

- **`test`** — esegue `pnpm test`, che aggrega
  `test:common && test:runbooks && test:packages && test:scripts && test:functions && test:infra`.
  Copre ogni workspace con uno script `test`, indipendentemente dal coverage.
- **`coverage`** — esegue `pnpm test:coverage`, con le soglie 90/80/90 passate
  come input del workflow riusabile e i report `lcov.info` caricati come
  artifact. Copre solo i 3 workspace di cui sopra, per i motivi descritti.

## Mocking e Test Doubles

Nessuna libreria di mocking in dipendenza: zero `jest`, `sinon`, `mocha` o
`testdouble` in tutto il repo. Lo stile dominante è **fake scritte a mano +
dependency injection**: una funzione o una classe riceve le proprie
dipendenze come parametro (un client HTTP, un logger, un provider di
credenziali) e il test passa un'implementazione fittizia al posto di quella
reale. Import standard: `node:assert/strict`, `describe`/`it` da `node:test`;
il `mock` built-in di `node:test` è usato solo sporadicamente (una ventina di
file in tutto il repo) dove un fake scritto a mano sarebbe più verboso di uno
spy.

`go-runbook` ha un helper DI dedicato,
[`createTestServiceRegistry`](../packages/go-runbook/src/registry/createTestServiceRegistry.ts),
che costruisce un `ServiceRegistry` con stub per ogni servizio (CloudWatch
Logs, Watchtower client, ecc.) e override selettivi:

```typescript
const services = createTestServiceRegistry({ cloudWatchLogs });
```

È il pattern usato da oltre cento file di test dentro `packages/go-runbook` e
dai package che ne dipendono (`go-watchtower-runbook`, `scripts/go/go-rta-check`,
`scripts/go/go-execute-runbook`): invece di mockare il client reale, si passa
un registry con solo i servizi che il test esercita.
