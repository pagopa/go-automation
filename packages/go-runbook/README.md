# go-runbook

Motore runbook dichiarativo: definisce ed esegue procedure operative
strutturate come sequenze di step tipizzati, con branching condizionale,
rilevazione di tutti i casi noti presenti nell'evidenza (in ordine di tempo),
copertura dell'evidenza e azioni associate. Contiene anche i toolkit per le
famiglie di allarmi e i runbook concreti di SEND e INTEROP.

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
pnpm add @pagopa/go-runbook @pagopa/go-aws @pagopa/go-common
# solo se si usa ./runtime: i peer di @pagopa/go-aws/all (niente client-ec2)
pnpm add @aws-sdk/client-athena @aws-sdk/client-cloudwatch @aws-sdk/client-cloudwatch-logs \
         @aws-sdk/client-dynamodb @aws-sdk/util-dynamodb @aws-sdk/client-ecs @aws-sdk/client-lambda \
         @aws-sdk/client-s3 @aws-sdk/client-scheduler @aws-sdk/client-secrets-manager \
         @aws-sdk/client-sqs @aws-sdk/client-ssm
```

Solo `./runtime` carica gli SDK: gli altri sei entrypoint funzionano senza nessun peer installato.

## Entrypoint

| Import                                | Contenuto                                                                                                                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@pagopa/go-runbook`                  | **Engine**: tipi, contesto, condizioni, step di controllo, azioni, trace, `RunbookBuilder`, `RunbookEngine`. Non conosce AWS, prodotti, allarmi né Watchtower.                                          |
| `@pagopa/go-runbook/output`           | Contratto dell'output dei runbook verso Watchtower (`RunbookOutput` schema `2.0.0`, `classifyRunbookOutcome`, `buildErrorChains`, `renderErrorChainLines`, `buildCoverageLines`, bozza d'analisi, …).   |
| `@pagopa/go-runbook/toolkits/common`  | Toolkit operativo comune: `OperationalRunbookEngine`, step AWS e HTTP, famiglie `apigw`, `lambda`, `service` senza dati di prodotto, account logici, helper di test.                                    |
| `@pagopa/go-runbook/toolkits/send`    | Toolkit SEND: pipeline e profili SEND delle famiglie (`apigw`, `lambda`, `service`, `downstream`), `SEND_DOWNSTREAMS`, `SEND_ACCOUNTS`.                                                                 |
| `@pagopa/go-runbook/toolkits/interop` | Toolkit INTEROP: famiglie `interop.apigw` e `interop.k8s`, ambienti e downstream INTEROP.                                                                                                               |
| `@pagopa/go-runbook/inventory`        | Runbook concreti e catalogo (`RUNBOOK_CATALOG`, `RUNBOOK_REGISTRY`, `RunbookDescriptor`, …).                                                                                                            |
| `@pagopa/go-runbook/runtime`          | Composizione per l'esecuzione: `executeRunbookForOccurrence`, `createServiceRegistry`, `bindServicesToOccurrence`, porta degli account (`createAwsAccountsPort`), reporter, `scrubAwsProfileNamesDeep`. |

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
- Superficie pubblica di ogni entrypoint: cartella [`api/`](api/).
- Controlli prima della pubblicazione (report API, smoke test, budget di import): [docs/PUBLISHED_PACKAGES_CHECKS.md](../../docs/PUBLISHED_PACKAGES_CHECKS.md).
- Modifiche tra le versioni: `CHANGELOG.md`, creato al primo rilascio.

## Consumatori

`go-watchtower-runbook` e gli script che eseguono o analizzano runbook:
`go-analyze-alarm`, `go-rta-check`, `interop-analyze-alarms`. Fuori dal monorepo lo
importa la Lambda `wt-analyze-alarm` di go-watchtower-pro, dal package pubblicato.

## Test e build

```bash
pnpm --filter=@pagopa/go-runbook test
pnpm --filter=@pagopa/go-runbook build
```
