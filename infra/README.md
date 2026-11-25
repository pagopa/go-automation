# infra

Infrastruttura del monorepo:

- **`docker/`** — `Dockerfile.runtime` e `docker-entrypoint.sh`, l'immagine
  e l'entrypoint multi-mode (`once` / `cron` / `shell`, controllati da
  `RUN_MODE`) condivisi da tutti gli script packagizzati come container.
  Dettagli: `docs/DEPLOY.md`.

## Comandi

```bash
# Docker runtime (da uno script)
./bins/build-image.sh <script> [tag]
./bins/docker-run.sh <script>
```
