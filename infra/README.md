# infra

Infrastruttura del monorepo, due sottocartelle indipendenti:

- **`docker/`** — `Dockerfile.runtime` e `docker-entrypoint.sh`, l'immagine
  e l'entrypoint multi-mode (`once` / `cron` / `shell`, controllati da
  `RUN_MODE`) condivisi da tutti gli script packagizzati come container.
  Dettagli: `docs/DEPLOY.md`.
- **`watchtower-alarm-analysis/`** — stack **SST** (nome app
  `go-execute-runbook`; `go-execute-runbook-infra` è il nome npm del
  package) per la Lambda di esecuzione runbook (`go-ExecuteRunbookLambda`)
  e la coda SQS che la alimenta. Deploy per stage
  `${DEPLOY_ENV}-${DEPLOY_REGION}`. Dettagli: `docs/ARCHITECTURE.md` e
  `docs/RUNBOOKENGINE.md`.

## Comandi

```bash
# Docker runtime (da uno script)
./bins/build-image.sh <script> [tag]
./bins/docker-run.sh <script>

# Deploy SST
pnpm deploy:execute-runbook
```
