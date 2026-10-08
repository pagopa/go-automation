# go-SendMonitorTppMessagesLambda

Lambda wrapper per `send-monitor-tpp-messages`: monitora i messaggi TPP
tramite query Athena e genera report, con notifica Slack opzionale.

Pattern wrapper: importa `scriptMetadata`/`scriptParameters` da
`send-monitor-tpp-messages/config` e anche `main()` dallo script, come
`go-SendMonitorAthenaQueryLambda`. A differenza di quest'ultimo, carica
anche l'S3 service per caricare i report CSV generati.

## Responsabilità

L'handler (`script.createLambdaHandler<ScheduledEvent, void, Context>`),
invocato da EventBridge o direttamente con override nel payload, esegue
`main(script)` e poi, se `REPORTS_S3_BUCKET` è impostata, carica la
directory dei report CSV su S3 (`AWSS3Service.uploadDirectory`).

## Configurazione

| Variabile                  | Scopo                                                      |
| -------------------------- | ---------------------------------------------------------- |
| `SLACK_TOKEN`              | Mappata a `slack.token` (redatta nei log)                  |
| `REPORTS_S3_BUCKET`        | Bucket S3 per l'upload dei CSV (se assente, nessun upload) |
| `REPORTS_S3_PREFIX`        | Prefisso chiave S3 (default `reports/tpp-monitor`)         |
| `DEBUG_RESOURCE_SNAPSHOTS` | Abilita snapshot diagnostici di memoria/handle nei log     |

Le credenziali AWS arrivano dal ruolo di esecuzione (nessun profilo SSO).

## Documentazione

Script CLI sottostante: `scripts/send/send-monitor-tpp-messages`. Pattern
Lambda del repo e packaging esbuild: `CLAUDE.md`, sezione `functions/`.

## Build

```bash
pnpm --filter=go-send-monitor-tpp-messages-lambda build
pnpm --filter=go-send-monitor-tpp-messages-lambda build:typecheck
pnpm --filter=go-send-monitor-tpp-messages-lambda test:local
```
