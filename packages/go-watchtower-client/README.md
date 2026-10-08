# go-watchtower-client

Client TypeScript generato per l'API di Watchtower: autenticazione, census
di prodotto, allarmi/alarm event, runbook e analisi. `src/generated/` è
**rigenerato** dai soli contratti in
`contracts/runbook-automation/v1/upstream/go-watchtower/` e non va mai
editato a mano.

## Responsabilità

- **`WatchtowerAuth`** — gestione credenziali/login verso Watchtower.
- **`WatchtowerClient`** — metodi tipizzati sopra l'OpenAPI generato:
  `listProducts`, `listProductAlarms`, `listProductRunbooks`,
  `getProductCensus`, `listAlarmEvents`, `getShadowReport`, e altri.
- **`parseAutomaticAlarmAnalysisCommandV1`** / `watchtowerErrorReason` —
  parsing e classificazione errori sui contratti generati.
- **`src/generated/`** — client OpenAPI (`openapi-typescript`) e tipi dai
  JSON Schema upstream (`json-schema-to-typescript`), rigenerati con
  `pnpm --filter=@go-automation/go-watchtower-client generate`.

Consumato da `go-watchtower-runbook`, `go-execute-runbook`, `go-rta-check`.

## Esempio

```typescript
import { WatchtowerClient } from '@go-automation/go-watchtower-client';

const client = new WatchtowerClient({ baseUrl, credentials });
const alarms = await client.listProductAlarms(productId);
```

## Test e build

```bash
pnpm --filter=@go-automation/go-watchtower-client test
pnpm --filter=@go-automation/go-watchtower-client build
pnpm --filter=@go-automation/go-watchtower-client generate
```
