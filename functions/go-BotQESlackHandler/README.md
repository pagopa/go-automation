# go-BotQESlackHandler

Riceve lo slash command Slack `/goai`, risponde subito (entro i 3s
richiesti da Slack) e invoca `go-AILambda` in modo asincrono passando
`response_url`. `go-AILambda` invoca Bedrock e posta il risultato
direttamente su Slack.

Come `go-AILambda`, è un handler scritto a mano (nessuno script CLI a
monte, nessun `GOScript.createLambdaHandler()`): usa
`@aws-sdk/client-lambda` per l'invocazione asincrona e `node:crypto` per
verificare la firma della richiesta Slack.

## Sintassi dello slash command

```
/goai gherkin L'utente può resettare la password via email, link valido 24h
/goai normal As a user I want to...
/goai srs-analysis The system shall...
```

## Configurazione

Esposto dietro API Gateway (`POST`, `application/x-www-form-urlencoded`).

| Variabile              | Scopo                                                              |
| ---------------------- | ------------------------------------------------------------------ |
| `GO_AI_LAMBDA_NAME`    | Nome della Lambda `go-AILambda` da invocare (default `go-ai-prod`) |
| `SLACK_SIGNING_SECRET` | Verifica della firma della richiesta Slack                         |

## Documentazione

Lambda invocata asincronamente: `functions/go-AILambda/README.md`. Pattern
Lambda del repo e packaging esbuild: `CLAUDE.md`, sezione `functions/`.

## Build

```bash
pnpm --filter=go-bot-qe-slack-handler build
pnpm --filter=go-bot-qe-slack-handler build:typecheck
```
