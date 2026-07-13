import type { InteropAlarmContext } from '../types/index.js';

interface InteropCloudWatchLogsQuery {
  readonly logGroup: string;
  readonly query: string;
}

export interface ApplicationLogsErrorsQuery extends InteropCloudWatchLogsQuery {
  readonly podApp: string;
}

export interface CidTrackerQuery extends InteropCloudWatchLogsQuery {
  readonly cid: string;
}

export function buildApplicationLogsErrorsQuery(context: InteropAlarmContext): ApplicationLogsErrorsQuery {
  const escapedPodApp = escapeLogsInsightsRegexLiteral(context.podApp);

  return {
    podApp: context.podApp,
    logGroup: context.logGroup,
    query: `
# LG: ${context.logGroup}
fields @timestamp, @message
| sort @timestamp asc
| filter (@message like /ERROR/ or stream = "stderr")
| filter @logStream not like /adot-collector/
| filter pod_app like /${escapedPodApp}/
| parse @message "[CID=*]" as cid
| display @timestamp, pod_app, cid, @message
  `,
  };
}

export function buildCidTrackerQuery(context: InteropAlarmContext, cid: string): CidTrackerQuery {
  const escapedCid = escapeLogsInsightsString(cid);

  return {
    cid,
    logGroup: context.logGroup,
    query: `
# LG: ${context.logGroup}
fields @timestamp, @message
| sort @timestamp asc
| parse @message "[CID=*]" as cid
| filter cid= "${escapedCid}"
| display @timestamp, pod_app, cid, @message
   `,
  };
}

function escapeLogsInsightsString(value: string): string {
  return value.replace(/\0/gu, '').replace(/\\/gu, '\\\\').replace(/"/gu, '\\"');
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
