# go-ExecuteRunbookLambda

SQS adapter per `go-execute-runbook`: esegue un ciclo di vita di runbook
automatico Watchtower per ogni messaggio in coda.

È il pattern wrapper canonico del repo: non duplica logica, importa
`scriptMetadata`/`scriptParameters` da `go-execute-runbook/config` e si
ferma lì — la logica di esecuzione batch (`processExecuteRunbookBatch`,
`buildExecuteRunbookDeps`, `executeRunbook`, …) viene dal subpath export
`go-execute-runbook/api`, non da `main()`.

## Responsabilità

L'handler (`script.createLambdaHandler<SQSEvent, SQSBatchResponse,
Context>`) riceve un batch SQS, costruisce le dipendenze di esecuzione
(`buildExecuteRunbookDeps`) e processa ogni record:

- Parsing del messaggio (`parseExecuteRunbookMessage`).
- Esecuzione del runbook (`executeRunbook`).
- In caso di errore classificato come `FAIL_EXECUTION` con un
  `executionId` recuperabile, segnala il fallimento terminale a
  Watchtower (`failPreStartCommand`) invece di far ritentare SQS.
- Negli altri casi, il messaggio torna come `batchItemFailure` (retry SQS).

Il tempo rimanente della Lambda (`context.getRemainingTimeInMillis()`)
viene usato per calcolare una deadline di sicurezza (30s di margine)
passata a ogni esecuzione.

## Documentazione

Motore ed execute-runbook CLI: `packages/go-runbook/README.md` e
`scripts/go/go-execute-runbook`. Deploy SST dell'infrastruttura:
`infra/README.md` e `docs/DEPLOY.md`.

## Build

```bash
pnpm --filter=go-execute-runbook-lambda build
pnpm --filter=go-execute-runbook-lambda build:typecheck
```
