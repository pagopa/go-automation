import { interop } from '../framework.js';

/** CloudWatch Logs Insights profile ids surfaced in execution traces. */
export const INTEROP_API_GW_5XX_QUERY_PROFILE_ID = 'interop-api-gateway-access-log-5xx';
export const INTEROP_BFF_5XX_QUERY_PROFILE_ID = 'interop-k8s-bff-5xx';

export function buildInteropApiGw5xxAggregateQuery(apiGwId: string): string {
  return interop.apigw.buildInteropApiGwStatusAggregateQuery(apiGwId, 5);
}

/**
 * BFF scan from the document. It deliberately includes 5xx response messages
 * regardless of severity because some relevant calls are not logged as ERROR.
 */
export function buildInteropBff5xxApplicationLogsQuery(podApp: string): string {
  const escapedPodApp = escapeLogsInsightsRegexLiteral(podApp);
  return `
filter (@message like /ERROR/ or stream = "stderr" or @message like /(?i)Response\\s*5[0-9]{2}/)
| filter @logStream not like /adot-collector/
| filter pod_app like /${escapedPodApp}/
| parse @message "[CID=*]" as cid
| display @timestamp, pod_app, cid, @message
| sort @timestamp asc
| limit 10000
`.trim();
}

function escapeLogsInsightsRegexLiteral(value: string): string {
  const escaped: string[] = [];
  for (const char of value) {
    escaped.push(REGEX_LITERAL_SPECIAL_CHARS.has(char) ? `\\${char}` : char);
  }
  return escaped.join('');
}

const REGEX_LITERAL_SPECIAL_CHARS: ReadonlySet<string> = new Set([
  '\\',
  '/',
  '[',
  ']',
  '{',
  '}',
  '(',
  ')',
  '*',
  '+',
  '?',
  '.',
  '^',
  '$',
  '|',
  '-',
]);
