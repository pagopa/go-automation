/**
 * Canonical CloudWatch Logs Insights query for the API Gateway AccessLog
 * of a `pn-*` runbook.
 *
 * Mirrors the reference template hosted in `go-runbooks`
 * (`data/templates/send/queries/query-apigw.md.njk`). The minimum status
 * threshold is parameterised via the `{{minStatusCode}}` placeholder so
 * that {@link createApiGwAlarmRunbook} can resolve it at build time
 * without paying the cost of runtime interpolation.
 *
 * The query carries no time-range filter: CloudWatch Logs Insights
 * receives the time window as separate `startTime`/`endTime` parameters
 * via the configured CloudWatch Logs query service.
 *
 * Status and authorizer fields are checked together: `status` covers
 * routing errors, `authorizerStatus` covers authorizer failures, and
 * `integrationServiceStatus` covers downstream integration failures.
 */
export const DEFAULT_API_GW_QUERY = `filter status >= {{minStatusCode}} or authorizerStatus >= {{minStatusCode}} or integrationServiceStatus >= {{minStatusCode}}
| sort status desc, authorizerStatus desc, integrationServiceStatus desc, @timestamp asc
| limit 1000
| display @timestamp, xrayTraceId, requestId, authorizerRequestId, integrationRequestId, errorMessage, httpMethod, path, authorizerStatus, authorizerLatency, integrationServiceStatus, status`;
