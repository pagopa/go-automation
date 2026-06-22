# go-execute-runbook

Esegue un runbook automatico per una singola occorrenza Watchtower. Il core in `api.ts` è condiviso dalla CLI e da `go-ExecuteRunbookLambda`.

## Prerequisiti

- credenziali AWS per il monitoring account;
- endpoint TLS interno Watchtower;
- service principal `runbook-automation-worker`;
- OAM sink/link configurati nella regione dell'evento.

## Configurazione

La CLI richiede `--alarm-event-id`, `--execution-id`, `--watchtower-url`, `--watchtower-service-id` e `--watchtower-password` oppure `--watchtower-service-secret-arn`.

## Utilizzo

```bash
pnpm --filter=go-execute-runbook dev -- --alarm-event-id <uuid> --execution-id <uuid> --watchtower-url https://watchtower.internal --watchtower-service-id runbook-automation-worker
```
