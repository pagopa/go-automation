import { interop } from '../framework.js';

export const INTEROP_AUTH_SERVER_WARNINGS_QUERY_PROFILE_ID = 'interop-k8s-auth-server-warnings';

export function buildInteropAuthServerApiGw4xxAggregateQuery(apiGwId: string): string {
  return interop.apigw.buildInteropApiGwStatusAggregateQuery(apiGwId, 4);
}

/**
 * Aggregates causally relevant auth-server warnings while retaining one CID
 * and one timestamp for every distinct error message.
 */
export function buildInteropAuthServerWarningsQuery(podApp: string): string {
  const escapedPodApp = escapeLogsInsightsRegexLiteral(podApp);
  return `
fields @timestamp, @message
| filter pod_app like /${escapedPodApp}/
| filter @message like /WARN/
| filter @message not like /Invalid claims in client assertion payload/
| parse @message /\\[CID=(?<cidValue>[^\\]]*)\\](?:\\s*\\[SPANID=[^\\]]*\\])?\\s*(?<errorMessage>.*?)","pod_app":/
| stats count(*) as count, latest(@timestamp) as latestTimestamp, latest(cidValue) as cid by errorMessage
| display latestTimestamp, count, cid, errorMessage
| sort count desc
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
