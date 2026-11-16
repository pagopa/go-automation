# @pagopa/go-aws

L'integrazione AWS di GO Automation: credenziali e profili, cache dei client per profilo, un sottopercorso per ogni servizio AWS e un aggregato per la composizione (`./all`).

I client dell'AWS SDK sono **dipendenze peer facoltative**: si installano solo quelli dei sottopercorsi che si usano.

## Installazione

Il package è pubblicato su **GitHub Packages** dell'organizzazione `pagopa`. Nel repository che lo usa serve un `.npmrc`:

```ini
@pagopa:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

- **In locale:** un PAT _classic_ con `read:packages`, autorizzato SSO per l'organizzazione `pagopa`, esportato come `NODE_AUTH_TOKEN`.
- **In GitHub Actions:** `permissions: { packages: read }` e `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`. Il repository consumatore va abilitato in _Package settings → Manage Actions access_.

Richiede Node.js `>=22.19.0` ed è solo ESM.

```bash
pnpm add @pagopa/go-aws @pagopa/go-common
pnpm add @aws-sdk/client-s3   # i peer del sottopercorso che si usa, vedi la tabella
```

## Sottopercorsi e peer

Ogni sottopercorso carica solo i client SDK della sua riga.

| Sottopercorso                             | Contenuto                                                                              | Peer SDK da installare                                                     |
| ----------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `@pagopa/go-aws`                          | credenziali (`GOAWSCredentialsManager`), profili, `AWSActiveOperationRegistry`, errori | nessuno (`client-sts` e `credential-provider-ini` sono dipendenze dirette) |
| `@pagopa/go-aws/s3`                       | `AWSS3Service`                                                                         | `@aws-sdk/client-s3`                                                       |
| `@pagopa/go-aws/sqs`                      | `AWSSQSService`, `SQSUtils`                                                            | `@aws-sdk/client-sqs`, `@aws-sdk/client-cloudwatch`                        |
| `@pagopa/go-aws/dynamodb`                 | `AWSDynamoDBService`, query DynamoDB                                                   | `@aws-sdk/client-dynamodb`, `@aws-sdk/util-dynamodb`                       |
| `@pagopa/go-aws/athena`                   | `AWSAthenaService`                                                                     | `@aws-sdk/client-athena`                                                   |
| `@pagopa/go-aws/cloudwatch-logs`          | `AWSCloudWatchLogsService`                                                             | `@aws-sdk/client-cloudwatch-logs`                                          |
| `@pagopa/go-aws/cloudwatch-logs/insights` | helper di Logs Insights (escape, lettura delle righe), senza SDK                       | nessuno, neanche per i tipi                                                |
| `@pagopa/go-aws/profiles`                 | voci dei profili, rubrica degli account logici, permission set dall'ARN, senza SDK     | nessuno                                                                    |
| `@pagopa/go-aws/cloudwatch-metrics`       | `AWSCloudWatchMetricsService`                                                          | `@aws-sdk/client-cloudwatch`                                               |
| `@pagopa/go-aws/cloudwatch-alarms`        | `AWSCloudWatchAlarmsService`                                                           | `@aws-sdk/client-cloudwatch`                                               |
| `@pagopa/go-aws/ecs`                      | `AWSECSService`                                                                        | `@aws-sdk/client-ecs`                                                      |
| `@pagopa/go-aws/lambda`                   | `AWSLambdaService`                                                                     | `@aws-sdk/client-lambda`                                                   |
| `@pagopa/go-aws/scheduler`                | `AWSSchedulerService`                                                                  | `@aws-sdk/client-scheduler`                                                |
| `@pagopa/go-aws/secrets-manager`          | `AWSSecretsManagerService`                                                             | `@aws-sdk/client-secrets-manager`                                          |
| `@pagopa/go-aws/ssm`                      | `AWSSSMService`                                                                        | `@aws-sdk/client-ssm`                                                      |
| `@pagopa/go-aws/ec2`                      | factory del client EC2                                                                 | `@aws-sdk/client-ec2`                                                      |
| `@pagopa/go-aws/all`                      | `AWSProvider`, `AWSServiceProvider`, `AWSMultiClientProvider` (composizione)           | tutti i client della tabella **tranne** `client-ec2`                       |

## Esempio

```typescript
import { AWSProvider } from '@pagopa/go-aws/all';

// Senza profili usa la catena di credenziali di default (per esempio il ruolo della Lambda).
const aws = new AWSProvider({ region: 'eu-south-1' });
const logs = aws.services.cloudWatchLogs;
```

## Documentazione

- Guida d'uso: [docs/GOCOMMON.md](../../docs/GOCOMMON.md).
- Account AWS logici e rubrica: [docs/AWS_LOGICAL_ACCOUNTS.md](../../docs/AWS_LOGICAL_ACCOUNTS.md).
- Superficie pubblica di ogni sottopercorso: cartella [`api/`](api/).
- Controlli prima della pubblicazione (report API, smoke test, budget di import): [docs/PUBLISHED_PACKAGES_CHECKS.md](../../docs/PUBLISHED_PACKAGES_CHECKS.md).
- Modifiche tra le versioni: `CHANGELOG.md`, creato al primo rilascio.

## Test e build

```bash
pnpm --filter=@pagopa/go-aws test
pnpm --filter=@pagopa/go-aws build
```
