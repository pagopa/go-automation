# create-runbook

Scaffolds a new runbook for `go-analyze-alarm` from a template and — by
default — registers it in the analyzer's `RUNBOOK_REGISTRY` (`main.ts`).

## Usage

```bash
# fully interactive
pnpm create:runbook

# non-interactive (API Gateway alarm)
pnpm create:runbook \
  --type api-gateway \
  --id pn-foo-BAR-ApiGwAlarm \
  --description "Analizza gli allarmi API Gateway di pn-foo" \
  --api-gw-log-group "<AccessLog log group>" \
  --entry-service pn-foo \
  --authorizer pn-b2bAuthorizerLambda

# non-interactive (Lambda LogInvocationErrors alarm)
pnpm create:runbook \
  --type lambda \
  --id pn-fooLambda-LogInvocationErrors-Alarm \
  --description "Analizza gli allarmi LogInvocationErrors di pn-fooLambda" \
  --entry-lambda pn-fooLambda \
  --event-source sqs

# preview only, write nothing
pnpm create:runbook --type base --id pn-foo-Bar --dry-run
```

## Templates

| id            | files generated                                                     | description                                          |
| ------------- | ------------------------------------------------------------------- | ---------------------------------------------------- |
| `api-gateway` | `knownServices.ts`, `knownUrls.ts`, `knownCases.ts`, `runbook.ts`   | Full API Gateway alarm runbook (4 files)             |
| `lambda`      | `knownServices.ts`, `knownErrors.ts`, `knownCases.ts`, `runbook.ts` | Lambda `LogInvocationErrors` alarm runbook (4 files) |
| `base`        | `runbook.ts`                                                        | Generic `RunbookBuilder` runbook                     |

Template sources live in `bins/runbook-templates/<id>/*.template` and use
`{{TOKEN}}` placeholders.

## Adding a new template type

1. Create `bins/runbook-templates/<new-id>/` with the `*.template` files.
2. Add a `RunbookTemplate` descriptor (see `src/templates/apiGatewayTemplate.ts`)
   and register it in `src/templates/runbookTemplates.ts`.

No changes to the generator engine are required.

## Flags

| flag                   | description                                                            |
| ---------------------- | ---------------------------------------------------------------------- |
| `--type <id>`          | Template id (`api-gateway` \| `lambda` \| `base`); prompted if omitted |
| `--id <runbook-id>`    | Runbook id and directory name                                          |
| `--builder <name>`     | Builder function name (default: derived from id)                       |
| `--description <text>` | Runbook metadata description                                           |
| `--version <semver>`   | Runbook metadata version (default: `1.0.0`)                            |
| `--team <team>`        | Runbook metadata team (default: `GO`)                                  |
| `--tags <csv>`         | Comma-separated metadata tags                                          |
| `--no-wire`            | Do not modify `go-analyze-alarm` `main.ts`                             |
| `--dry-run`            | Render and print without writing or wiring                             |
| `--yes`                | Skip the confirmation prompt                                           |

API Gateway template inputs: `--api-gw-log-group`, `--entry-service`,
`--var-prefix`, `--log-group`, `--execution-log-group`, `--authorizer`.

Lambda template inputs: `--entry-lambda`, `--var-prefix`, `--event-source`.

## Tests

```bash
pnpm create:runbook:test
```
