# go-AILambda

Lambda wrapping `@go-automation/go-ai`: invoca Bedrock direttamente, oppure
inoltra il risultato a Slack via `go-BotQESlackHandler`.

A differenza del pattern wrapper canonico del repo (vedi
`functions/go-ExecuteRunbookLambda`), questo handler è scritto a mano:
non esiste uno script CLI a monte e non usa
`GOScript.createLambdaHandler()`.

## Responsabilità

`handler.ts` espone due modalità d'invocazione:

1. **Diretta** (AWS CLI, altre Lambda): evento `{ hat, input }` →
   restituisce `GOAIResponse`.
2. **Da `go-BotQESlackHandler`**: evento `{ hat, input, responseUrl,
userName }` → invoca Bedrock tramite `GOBedrockClient`, posta il
   risultato formattato su Slack via `responseUrl`, non ritorna nulla.

Richiede il permesso IAM `bedrock:InvokeModel` sul model ARN configurato.

## Esempio (invocazione diretta)

```json
{ "hat": "gherkin", "input": "L'utente può resettare la password via email" }
```

## Documentazione

`RUN_MODE` e deploy standalone/Docker: `docs/DEPLOY.md`. Pattern Lambda
del repo (wrapper vs handler scritti a mano) e packaging esbuild:
`CLAUDE.md`, sezione `functions/`. Modulo invocato: `packages/go-ai/README.md`.

## Build

```bash
pnpm --filter=go-ai-lambda build
pnpm --filter=go-ai-lambda build:typecheck
```
