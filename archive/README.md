# Archive

Script, function e tool dismessi, conservati solo come riferimento storico.

Il contenuto di questa cartella è **fuori dal workspace pnpm** (`pnpm-workspace.yaml`) e quindi non viene installato, compilato né testato. È inoltre escluso esplicitamente dai quality gate che scansionano l'intero repository:

| Gate                       | Esclusione                           |
| -------------------------- | ------------------------------------ |
| ESLint (`pnpm lint`)       | `archive/` nelle global ignores di `eslint.config.mjs` |
| Prettier (`format:check`)  | `archive/` in `.prettierignore`      |
| knip                       | `archive/**` in `ignore` di `knip.config.ts` |

Gli altri gate (`validate:scaffold`, `deps:check`, `dup:check`, `type-coverage`, build e test) operano solo su `packages/`, `scripts/`, `functions/`, `infra/` e `bins/`.

## Archiviare uno script o una function

1. Rimuovere `dist/`, `node_modules/` e `*.tsbuildinfo` dalla cartella.
2. Spostarla in `archive/<nome>/` (preferibilmente con `git mv` per preservare la history).
3. Rimuovere i riferimenti residui: `tsconfig.json` (references), `tsconfig.type-coverage.json` (paths), `knip.config.ts` (workspace dedicati), script nel `package.json` root, function che dipendono dallo script, documentazione in `docs/`.
4. Aggiungere un banner di archiviazione al README con il sostituto.
5. Eseguire `pnpm install` per aggiornare `pnpm-lock.yaml`.

## Contenuto

| Cartella                           | Sostituito da                                                          |
| ---------------------------------- | ---------------------------------------------------------------------- |
| `send-monitor-tpp-messages/`       | `scripts/send/send-monitor-athena-query`                               |
| `go-SendMonitorTppMessagesLambda/` | `functions/go-SendMonitorAthenaQueryLambda`                            |
| `test-verso-consolidatore/`        | —                                                                      |
