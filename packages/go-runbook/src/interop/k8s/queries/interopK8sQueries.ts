export function buildInteropK8sApplicationLogsQuery(podApp: string): string {
  const escapedPodApp = escapeLogsInsightsRegexLiteral(podApp);
  return `
filter (@message like /ERROR/ or stream = "stderr")
| filter @logStream not like /adot-collector/
| filter pod_app like /${escapedPodApp}/
| parse @message "[CID=*]" as cid
| display @timestamp, pod_app, cid, @message
| sort @timestamp asc
`.trim();
}

export function buildInteropK8sCidTrackerQuery(cid: string): string {
  const escapedCid = escapeLogsInsightsString(cid);
  return `
parse @message "[CID=*]" as cid
| filter cid = "${escapedCid}"
| display @timestamp, pod_app, cid, @message
| sort @timestamp asc
`.trim();
}

function escapeLogsInsightsString(value: string): string {
  return value.replace(/\0/g, '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
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
