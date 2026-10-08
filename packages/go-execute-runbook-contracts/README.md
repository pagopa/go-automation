# go-execute-runbook-contracts

Contratti condivisi fra l'infrastruttura SST di `infra/watchtower-alarm-analysis`
e la sua tooling di deploy: tipi TypeScript, costanti e funzioni pure di
canonicalizzazione/validazione per il **catalogo automatico dei runbook**
(`AutomaticRunbookCatalogV1`) e il **registro della coda di execute-runbook**
(`ExecuteRunbookQueueRegistryV1`). Nessuna logica applicativa, solo contratti.

## Responsabilità

- Tipi e costanti dei due contratti (`AutomaticRunbookCatalogV1.ts`,
  `ExecuteRunbookQueueRegistryV1.ts`).
- `canonicalJson.ts` — serializzazione JSON canonica, usata per calcolare
  revisioni deterministiche dei payload.
- `automaticRunbookCatalogRevision.ts` / `queueRegistryRevision.ts` —
  build, canonicalizzazione e validazione dei rispettivi payload.

Consumato da `infra/watchtower-alarm-analysis` (stack SST) e da
`bins/deploy-execute-runbook-environment`, l'unico punto che importa questo
package insieme a `go-runbook` per generare il catalogo da pubblicare.

## Esempio

```typescript
import {
  buildAutomaticRunbookCatalog,
  validateAutomaticRunbookCatalog,
} from '@go-automation/go-execute-runbook-contracts';

const catalog = buildAutomaticRunbookCatalog(input);
validateAutomaticRunbookCatalog(catalog);
```

## Documentazione

Lo schema JSON corrispondente vive in
`contracts/runbook-automation/v1/automatic-runbook-catalog-v1.schema.json`
e `contracts/runbook-automation/v1/execute-runbook-queue-registry-v1.schema.json`.

## Test e build

```bash
pnpm --filter=@go-automation/go-execute-runbook-contracts test
pnpm --filter=@go-automation/go-execute-runbook-contracts build
```
