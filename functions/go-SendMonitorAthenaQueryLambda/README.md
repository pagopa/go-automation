# go-SendMonitorAthenaQueryLambda

Lambda wrapper per `send-monitor-athena-query`: pianifica l'esecuzione di
query Athena generiche per i report SEND, esportando i risultati e
pubblicandoli su Slack.

Pattern wrapper canonico del repo: importa `scriptMetadata`,
`scriptParameters` e l'hook `prepareConfig` da `send-monitor-athena-query/config`,
e anche `main()` dallo script — a differenza di `go-ExecuteRunbookLambda`,
che si ferma a metadata e parametri.

## Responsabilità

L'handler (`script.createLambdaHandler<ScheduledEvent>`), invocato da una
regola EventBridge schedulata, esegue `main(script)` con lo stesso
`GOScript` usato dalla CLI, applicando `prepareConfig` come hook
`onAfterConfigLoad` prima dell'esecuzione.

## Documentazione

Script CLI sottostante: `scripts/send/send-monitor-athena-query`. Pattern
Lambda del repo e packaging esbuild: `CLAUDE.md`, sezione `functions/`.

## Build

```bash
pnpm --filter=go-send-monitor-athena-query-lambda build
pnpm --filter=go-send-monitor-athena-query-lambda build:typecheck
pnpm --filter=go-send-monitor-athena-query-lambda test:local
```
