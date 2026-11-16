# go-runbook

Motore runbook dichiarativo: definisce ed esegue procedure operative
strutturate come sequenze di step tipizzati, con branching condizionale,
matching su casi noti e azioni associate. Contiene anche i toolkit per le
famiglie di allarmi e i runbook concreti di SEND e INTEROP.

## Entrypoint

| Import                                | Contenuto                                                                                                                                                                   |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@pagopa/go-runbook`                  | **Engine**: tipi, contesto, condizioni, step di controllo, azioni, trace, `RunbookBuilder`, `RunbookEngine`. Non conosce AWS, prodotti, allarmi né Watchtower.              |
| `@pagopa/go-runbook/output`           | Contratto dell'output dei runbook verso Watchtower (`RunbookOutput`, `classifyRunbookOutcome`, …).                                                                          |
| `@pagopa/go-runbook/toolkits/common`  | Toolkit operativo comune: `OperationalRunbookEngine`, step AWS e HTTP, famiglie `apigw`, `lambda`, `service` senza dati di prodotto, account logici, helper di test.        |
| `@pagopa/go-runbook/toolkits/send`    | Toolkit SEND: pipeline e profili SEND delle famiglie (`apigw`, `lambda`, `service`, `downstream`), `SEND_DOWNSTREAMS`, `SEND_ACCOUNTS`.                                     |
| `@pagopa/go-runbook/toolkits/interop` | Toolkit INTEROP: famiglie `interop.apigw` e `interop.k8s`, ambienti e downstream INTEROP.                                                                                   |
| `@pagopa/go-runbook/inventory`        | Runbook concreti e catalogo (`RUNBOOK_CATALOG`, `RUNBOOK_REGISTRY`, `RunbookDescriptor`, …).                                                                                |
| `@pagopa/go-runbook/runtime`          | Composizione per l'esecuzione: `executeRunbookForOccurrence`, `createServiceRegistry`, `bindServicesToOccurrence`, porta degli account (`createAwsAccountsPort`), reporter. |

Solo `./runtime` usa gli SDK AWS. Gli altri entrypoint usano i contratti senza
SDK di `@pagopa/go-aws` (`./cloudwatch-logs/insights`, `./profiles`) e le porte
di `ServiceRegistry`, che i servizi di go-aws soddisfano strutturalmente.

## Runbook concreti

I sorgenti stanno in `src/inventory/<prodotto>/<famiglia>/<alarm-name>/`
(per esempio `src/inventory/send/apigw/pn-delivery-B2B-ApiGwAlarm/`). Ogni
cartella contiene `runbook.ts` (con `buildRunbook()`), `registration.ts` e di
solito `knownCases.ts` e `knownServices.ts`. Le registrazioni di ogni prodotto
sono raccolte in `src/inventory/<prodotto>/manifest.ts`.

Per crearne uno nuovo: `pnpm create:runbook` (vedi
[bins/create-runbook/README.md](../../bins/create-runbook/README.md)).

## Esempio

```typescript
import { RunbookBuilder, logAction } from '@pagopa/go-runbook';
import { CloudWatchLogsQueryStep, OperationalRunbookEngine } from '@pagopa/go-runbook/toolkits/common';

const runbook = RunbookBuilder.create('alarm-api-gw-5xx')
  .metadata({ name: 'API GW 5xx' /* ... */ })
  .step(new CloudWatchLogsQueryStep({/* ... */}))
  .knownCase({/* ... */})
  .fallback(logAction({/* ... */}))
  .build();

const engine = new OperationalRunbookEngine(logger);
const result = await engine.execute(runbook, params, services, {
  invokedBy: 'manual',
  awsProfiles: ['my-profile'],
  region: 'eu-south-1',
});
```

`OperationalRunbookEngine` controlla, prima del primo step, che i servizi
richiesti dagli step siano presenti e che gli account AWS logici siano
configurati.

## Documentazione

- Reference del motore (step, condizioni, trace, builder, servizi):
  [docs/RUNBOOKENGINE.md](../../docs/RUNBOOKENGINE.md).
- Account AWS logici (rubrica, ambienti, modi di accesso):
  [docs/AWS_LOGICAL_ACCOUNTS.md](../../docs/AWS_LOGICAL_ACCOUNTS.md).
- Riassetto del package (engine, toolkit, inventory, runtime):
  [EVO-RBREORG-OPUS-01](../../docs/evolutions/EVO-RBREORG-OPUS-01.md).

## Consumatori

`go-watchtower-runbook` e gli script che eseguono o analizzano runbook:
`go-analyze-alarm`, `go-execute-runbook`, `go-rta-check`,
`interop-analyze-alarms`. La Lambda `go-ExecuteRunbookLambda` lo usa tramite
`go-execute-runbook`.

## Test e build

```bash
pnpm --filter=@pagopa/go-runbook test
pnpm --filter=@pagopa/go-runbook build
```
