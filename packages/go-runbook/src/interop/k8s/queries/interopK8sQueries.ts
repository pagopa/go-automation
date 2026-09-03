import { escapeLogsInsightsRegexLiteral, escapeLogsInsightsString } from '@go-automation/go-common/aws';
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
