# go-runbook

Motore runbook dichiarativo: definisce ed esegue procedure operative
strutturate come sequenze di step tipizzati, con branching condizionale,
matching su casi noti e azioni associate.

## Responsabilità

Il package espone:

- **Core** (`RunbookEngine`, `ConditionEvaluator`) — esegue un `Runbook`
  step dopo step, valuta i casi noti e produce un `RunbookExecutionResult`
  con trace completa.
- **Builder** (`RunbookBuilder`) — API fluente per comporre un runbook
  (step, known case, fallback).
- **Toolkit per dominio** (`apigw`, `lambda`, `service`, `downstream`,
  `interop`) — step e helper pre-costruiti per le famiglie di allarmi più
  comuni del repository.
- **`@pagopa/go-runbook/inventory`** — i runbook concreti e il loro registro
  (`RUNBOOK_CATALOG`, `RUNBOOK_REGISTRY`, `RunbookDescriptor`, …). I sorgenti
  sono in `src/catalog/runbooks/<alarm-name>/`, ciascuno con la propria
  `registration.ts` e `knownCases.ts`.
- **`@pagopa/go-runbook/runtime`** — esecuzione per occorrenza
  (`executeRunbookForOccurrence`), legame dei servizi all'occorrenza
  (`bindServicesToOccurrence`), registry dei servizi (`createServiceRegistry`),
  reporter e calcolo della finestra temporale.

I tipi dell'engine (`.`) non dipendono dagli SDK AWS: `ServiceRegistry` usa il
contratto `AWSCloudWatchLogsQueryService` di `@pagopa/go-aws/cloudwatch-logs/insights`
e le porte `RunbookAthenaPort`, `RunbookCloudWatchMetricsPort` e
`RunbookDynamoDBPort`, che i servizi di go-aws soddisfano strutturalmente.

Consumato da `go-watchtower-runbook`, e dagli script che eseguono o
analizzano runbook: `go-analyze-alarm`, `go-execute-runbook`,
`go-rta-check`, `interop-analyze-alarms`.

## Esempio

```typescript
import { RunbookBuilder, RunbookEngine, CloudWatchLogsQueryStep, logAction } from '@pagopa/go-runbook';

const runbook = RunbookBuilder.create('alarm-api-gw-5xx')
  .metadata({ name: 'API GW 5xx' /* ... */ })
  .step(new CloudWatchLogsQueryStep({/* ... */}))
  .knownCase({/* ... */})
  .fallback(logAction({/* ... */}))
  .build();

const engine = new RunbookEngine(logger);
const result = await engine.execute(runbook, params, services);
```

## Documentazione

Reference completa del motore (step, condizioni, trace, builder API):
`docs/RUNBOOKENGINE.md`. Convenzioni specifiche del catalogo (scaffolding
con `pnpm create:runbook`, registrazione nel manifest, `knownCases.ts`):
`packages/go-runbook/CLAUDE.md`.

## Test e build

```bash
pnpm --filter=@pagopa/go-runbook test
pnpm --filter=@pagopa/go-runbook build
```
