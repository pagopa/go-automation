# go-common

Libreria condivisa per operazioni AWS comuni utilizzata negli script GO
Automation: è il layer di fondo del monorepo — non dipende da nessun altro
package del repository — e **ogni** script in `scripts/` deve riusarla
invece di reimplementare o installare equivalenti di terze parti (vedi
`docs/CONVENTIONS.md` e le regole `no-restricted-imports` su `scripts/**`
in `CLAUDE.md`).

## Responsabilità

Il package espone due namespace:

- **`Core`** (`packages/go-common/src/libs/core/`) — il framework script
  (`GOScript`, parsing parametri, deployment mode detection), logging
  strutturato (`GOLogger`), configurazione multi-provider, prompt/spinner
  interattivi, importer/exporter (CSV, JSON, HTML), gestione file e path
  (`GOPaths`), utility di rete/HTTP, errori tipizzati, eventi e altro.
- **`AWS`** (`packages/go-common/src/libs/aws/`) — gestione credenziali e
  login SSO automatico (`GOAWSCredentialsManager`) e un servizio dedicato
  per ciascun servizio AWS usato nel repo: CloudWatch (Alarms, Logs
  Insights, Metrics), Athena, DynamoDB, ECS, S3, SQS, Scheduler (Eventbridge),
  Secrets Manager, oltre ai provider multi-account/multi-profilo
  (`AWSProfileSet`, `AWSMultiClientProvider`).

Sono disponibili anche i subpath export `@go-automation/go-common/core` e
`@go-automation/go-common/aws`, per importare un solo namespace.

Consumato da: ogni package e script del monorepo (`packages/*`,
`scripts/*`, `functions/*`) tranne `go-common` stesso.

## Esempio

```typescript
import { Core } from '@go-automation/go-common';

const script = new Core.GOScript({
  metadata: scriptMetadata,
  parameters: scriptParameters,
});

await script.run(async () => {
  script.logger.info('Hello from go-common');
});
```

## Documentazione

API reference completa (GOScript, GOLogger, configurazione, importer/exporter,
GOPaths, prompt, HTTP, errori, eventi, credenziali AWS): `docs/GOCOMMON.md`.

## Test e build

```bash
pnpm --filter=@go-automation/go-common test
pnpm --filter=@go-automation/go-common test:coverage
pnpm build:common
```
