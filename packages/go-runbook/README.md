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
- **`catalog/`** (subpath export `@go-automation/go-runbook/catalog`) —
  il catalogo concreto dei runbook, uno per `src/catalog/runbooks/<alarm-name>/`,
  ciascuno con la propria `registration.ts` e `knownCases.ts`.

Consumato da `go-watchtower-runbook`, e dagli script che eseguono o
analizzano runbook: `go-analyze-alarm`, `go-execute-runbook`,
`go-rta-check`, `interop-analyze-alarms`.

## Esempio

```typescript
import { RunbookBuilder, RunbookEngine, CloudWatchLogsQueryStep, logAction } from '@go-automation/go-runbook';

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
pnpm --filter=@go-automation/go-runbook test
pnpm --filter=@go-automation/go-runbook build
```
