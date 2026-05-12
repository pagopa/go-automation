/**
 * Canonical CloudWatch Logs Insights template for analysing the
 * application logs of a `pn-*` microservice within an API Gateway
 * runbook.
 *
 * Mirrors the reference template hosted in `go-runbooks`
 * (`data/templates/send/queries/query-ms.md.njk`).
 *
 * The `{{FILTER_CLAUSE}}` placeholder is replaced at runtime by
 * {@link queryServiceLogs} with a `filter` directive containing one or
 * more `@message like '<identifier>'` predicates joined by `or`.
 * The identifiers (X-Ray trace id, fallback UUID) are taken from the
 * runbook context vars; if none of them is available the step skips
 * the AWS call entirely instead of issuing a degenerate `like ''` filter
 * that would otherwise match every log line.
 *
 * The query carries no time-range filter: the time window is supplied
 * via the API parameters of `StartQueryCommand`.
 */
export const DEFAULT_SERVICE_QUERY_TEMPLATE = `{{FILTER_CLAUSE}}
| display @timestamp, level, ms, @message`;
