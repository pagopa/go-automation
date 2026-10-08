# go-watchtower-runbook

Libreria applicativa read-only che confronta i runbook di `go-runbook` con
i dati Watchtower: esecuzione/confronto delle occorrenze (parità analysis)
e copertura dichiarazioni ↔ censimento prodotto. Non prompta, non
renderizza, non scrive file e non termina il processo: progress e storage
entrano attraverso port dedicate, così il CLI che la usa resta un thin
adapter.

## Responsabilità

- **`check/`** — `checkOccurrence`/`checkOccurrences`: esegue un runbook
  su un'occorrenza reale e produce un `RunbookCheck` classificato.
- **`comparison/`** — `matchAnalysis` (match deterministico) e
  `matchAnalysisAi` (match tramite `go-ai`, hat `semantic-match`) fra
  l'output del runbook e l'analysis draft di Watchtower.
- **`coverage/`** — `checkRunbookCoverage`: confronta le dichiarazioni del
  catalogo runbook con il censimento prodotto restituito da Watchtower,
  producendo una `CoverageReport` con errori/warning tipizzati.
- **`cache/`** — fingerprint e cache dei risultati di check, chiave su
  contenuto del runbook.

Unico consumer: `scripts/go/go-rta-check`, che fa da adapter CLI
(progress rendering, output, dry-run) sopra questa libreria.

## Esempio

```typescript
import { checkRunbookCoverage } from '@go-automation/go-watchtower-runbook';

const report = await checkRunbookCoverage({ /* runbook catalog + product census */ });
```

## Documentazione

Motore runbook sottostante: `docs/RUNBOOKENGINE.md`. Comando CLI che la
usa: `docs/ANALYSIS-CLI.md`.

## Test e build

```bash
pnpm --filter=@go-automation/go-watchtower-runbook test
pnpm --filter=@go-automation/go-watchtower-runbook build
```
