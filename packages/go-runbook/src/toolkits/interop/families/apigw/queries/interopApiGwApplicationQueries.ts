import { escapeLogsInsightsRegexLiteral } from '@pagopa/go-aws/cloudwatch-logs/insights';

/** Maximum number of rows returned by an INTEROP API Gateway application-log query. */
export const INTEROP_API_GW_APPLICATION_QUERY_LIMIT = 10_000;

/**
 * Error scan of a service behind an INTEROP API Gateway.
 *
 * Deliberately widened beyond ERROR: some relevant calls are logged only as
 * a `Response 5xx` line, without an error severity.
 *
 * @param podApp - k8s pod app whose application logs are scanned
 * @param additionalMessagePatterns - Literal message markers that must survive the severity filter
 * @returns The CloudWatch Logs Insights query
 */
export function buildInteropApiGwServiceErrorsQuery(
  podApp: string,
  additionalMessagePatterns: ReadonlyArray<string> = [],
): string {
  const escapedPodApp = escapeLogsInsightsRegexLiteral(podApp);
  const additionalPredicates = additionalMessagePatterns
    .map((pattern) => ` or @message like /${escapeLogsInsightsRegexLiteral(pattern)}/`)
    .join('');
  return `
filter (@message like /ERROR/ or stream = "stderr" or @message like /(?i)Response\\s*5[0-9]{2}/${additionalPredicates})
| filter @logStream not like /adot-collector/
| filter pod_app like /${escapedPodApp}/
| parse @message "[CID=*]" as cid
| display @timestamp, pod_app, cid, @message
| sort @timestamp asc
| limit ${String(INTEROP_API_GW_APPLICATION_QUERY_LIMIT)}
`.trim();
}

/**
 * Aggregated warning scan of a service behind an INTEROP API Gateway.
 *
 * Groups by error message and keeps one CID and one timestamp per distinct
 * message, so a burst of the same warning reads as a single row with a count.
 *
 * @param podApp - k8s pod app whose application logs are scanned
 * @param excludedMessagePatterns - Literal message markers of non-causal warnings to drop (P18)
 * @returns The CloudWatch Logs Insights query
 */
export function buildInteropApiGwServiceWarningsQuery(
  podApp: string,
  excludedMessagePatterns: ReadonlyArray<string> = [],
): string {
  const escapedPodApp = escapeLogsInsightsRegexLiteral(podApp);
  const exclusions = excludedMessagePatterns
    .map((pattern) => `\n| filter @message not like /${escapeLogsInsightsRegexLiteral(pattern)}/`)
    .join('');
  return `
fields @timestamp, @message
| filter pod_app like /${escapedPodApp}/
| filter @message like /WARN/${exclusions}
| parse @message /\\[CID=(?<cidValue>[^\\]]*)\\](?:\\s*\\[SPANID=[^\\]]*\\])?\\s*(?<errorMessage>.*?)","pod_app":/
| stats count(*) as count, latest(@timestamp) as latestTimestamp, latest(cidValue) as cid by errorMessage
| display latestTimestamp, count, cid, errorMessage
| sort count desc
| limit ${String(INTEROP_API_GW_APPLICATION_QUERY_LIMIT)}
`.trim();
}
