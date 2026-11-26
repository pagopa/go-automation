import { escapeLogsInsightsRegexLiteral } from '@pagopa/go-aws/cloudwatch-logs/insights';

import { cidTrackerFilter } from './cidTrackerFilter.js';

/**
 * Logs Insights query of the error rows of an INTEROP pod, with their CID.
 *
 * @param podApp - Value of `pod_app`, matched as a literal
 * @returns The query
 */
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

/**
 * Logs Insights query of every row of some CIDs, whatever the pod.
 *
 * @param cids - CIDs to follow
 * @returns The query
 */
export function buildInteropK8sCidTrackerQuery(cids: ReadonlyArray<string>): string {
  return `
parse @message "[CID=*]" as cid
| ${cidTrackerFilter(cids)}
| display @timestamp, pod_app, cid, stream, @message
| sort @timestamp asc
`.trim();
}
