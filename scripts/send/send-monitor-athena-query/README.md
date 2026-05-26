# Send Monitor Athena Query

Esegue una query Athena parametrica, salva il risultato in CSV/JSON/JSONL e invia un report Slack opzionale con allegato e analisi soglie.

## Funzionalita

- Query Athena inline o da file.
- Placeholder sicuri:
  - `{{param.name}}` diventa `?` e viene passato ad Athena come `ExecutionParameters`.
  - `{{range.start.dateTime}}`, `{{range.end.dateTime}}`, `{{range.start.partitionHour}}`, `{{now.year}}` e varianti temporali.
  - `{{raw.tableName}}` per identificatori SQL validati.
  - alias legacy TPP come `{{startYear}}`, `{{startMonth}}`, `{{endDate}}`.
- Polling Athena centralizzato tramite `go-common` polling.
- Export locale in `data/send-monitor-athena-query/outputs/...`.
- Upload opzionale dell'artefatto finale su S3.
- Slack opzionale con allegato e messaggio custom.
- Regole soglia generiche o compatibilita legacy `analysis.threshold.field` + `analysis.threshold`.

## Prerequisiti

- Node.js e pnpm come da root `package.json`.
- Permessi Athena `StartQueryExecution`, `GetQueryExecution`, `GetQueryResults`.
- Permessi S3 sul bucket di output Athena e, se configurato, su `artifact.s3.location`.
- Token Slack bot solo se si vuole inviare il report su Slack.

## Configurazione Minima

```yaml
aws:
  profile: sso_pn-core-prod
  region: eu-south-1

athena:
  database: pn_analytics
  catalog: AwsDataCatalog
  workgroup: primary
  output:
    location: s3://my-athena-results/monitor/
  query: |
    SELECT status, count(*) AS total
    FROM my_table
    WHERE event_time >= {{range.start.dateTime}}
      AND event_time < {{range.end.dateTime}}
    GROUP BY status
```

`aws.profile` e' opzionale in ambienti AWS-managed o se la default credential chain SDK e' gia' configurata.

## Parametri Principali

| Parametro                                             | Default                 | Note                                                           |
| ----------------------------------------------------- | ----------------------- | -------------------------------------------------------------- |
| `--from` / `--to`                                     | `to=now`, `from=to-24h` | Range temporale.                                               |
| `--time-lookback-hours`                               | `24`                    | Usato se `from` e' assente.                                    |
| `--time-zone`                                         | `Europe/Rome`           | Parsing date e token template.                                 |
| `--aws-profile`                                       | -                       | Profilo SSO locale, opzionale con default chain.               |
| `--aws-region`                                        | `eu-south-1`            | Regione AWS.                                                   |
| `--athena-database`                                   | -                       | Database Athena, obbligatorio.                                 |
| `--athena-catalog`                                    | `AwsDataCatalog`        | Catalog Athena.                                                |
| `--athena-workgroup`                                  | `primary`               | Workgroup Athena.                                              |
| `--athena-output-location`                            | -                       | S3 output location Athena, obbligatorio.                       |
| `--athena-query`                                      | -                       | Query inline. Mutualmente esclusiva con `--athena-query-file`. |
| `--athena-query-file`                                 | -                       | File SQL in `configs/` o path assoluto.                        |
| `--athena-max-poll-attempts`                          | `60`                    | Override polling Athena.                                       |
| `--athena-poll-interval-ms`                           | `5000`                  | Delay costante fra poll.                                       |
| `--template-params`                                   | `[]`                    | `key=value`, usato da `{{param.key}}`.                         |
| `--template-raw`                                      | `[]`                    | `key=value`, usato da `{{raw.key}}`.                           |
| `--template-legacy-aliases`                           | `true`                  | Abilita alias legacy TPP.                                      |
| `--output-folder`                                     | `reports`               | Cartella output locale.                                        |
| `--output-format`                                     | `csv`                   | `csv`, `json`, `jsonl`.                                        |
| `--output-file-prefix`                                | `athena-report`         | Prefisso file generato.                                        |
| `--output-attach-when-empty`                          | `false`                 | Allega file Slack anche con zero righe.                        |
| `--artifact-s3-location`                              | -                       | Upload opzionale artefatto finale.                             |
| `--slack-token` / `--slack-channel`                   | -                       | Devono essere presenti insieme.                                |
| `--slack-message-template`                            | default report          | Template Slack.                                                |
| `--slack-send-on-empty`                               | `true`                  | Invia messaggio anche con zero righe.                          |
| `--slack-send-on-error`                               | `true`                  | Invia errore Slack su failure.                                 |
| `--analysis-rules`                                    | `[]`                    | JSON oppure DSL `name=x;field=y;operator=>;value=10`.          |
| `--analysis-threshold-field` / `--analysis-threshold` | -                       | Compatibilita legacy soglia singola.                           |

## Utilizzo

```bash
pnpm send:monitor:athena:query:dev
pnpm send:monitor:athena:query:build
pnpm send:monitor:athena:query:prod
```

Esempio CLI:

```bash
pnpm send:monitor:athena:query:dev -- \
  --aws-profile sso_pn-core-prod \
  --athena-database pn_analytics \
  --athena-output-location s3://my-athena-results/monitor/ \
  --athena-query-file query.sql \
  --template-params customerId=abc123
```

## Slack Template

Il template Slack usa placeholder `{{key}}`. Sono disponibili, fra gli altri:

- `{{startDate}}`, `{{endDate}}`, `{{startYear}}`, `{{endMonth}}`
- `{{rowCount}}`
- `{{analysis}}`
- `{{fileName}}`, `{{filePath}}`, `{{s3Uri}}`
- `{{executionId}}`, `{{database}}`

## Troubleshooting

- `Provide exactly one of athena.query or athena.query.file`: configura solo una sorgente query.
- `Unsafe raw Athena query placeholder value`: `template.raw` accetta solo identificatori SQL semplici o dotted, ad esempio `schema.table`.
- `slack.token and slack.channel must be provided together`: Slack e' opzionale, ma token e canale devono essere entrambi presenti.
- `Invalid S3 URI`: usa URI `s3://bucket/prefix`.
