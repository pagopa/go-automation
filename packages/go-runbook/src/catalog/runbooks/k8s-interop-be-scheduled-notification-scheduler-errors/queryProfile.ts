import { escapeLogsInsightsString } from '@go-automation/go-common/aws';
import { interop } from '../framework.js';

/** Exact scheduler; select errors in the application log rather than unrelated JSON metadata. */
function buildApplicationLogsQuery(podApp: string): string {
  return `filter (log like /ERROR/ or stream = "stderr")
| filter @logStream not like /adot-collector/
| filter pod_app = "${escapeLogsInsightsString(podApp)}"
| parse @message "[CID=*]" as cid
| display @timestamp, pod_app, @logStream, stream, cid, log, @message
| sort @timestamp asc`;
}

export const NOTIFICATION_SCHEDULER_QUERY_PROFILE: interop.k8s.InteropK8sQueryProfile = {
  ...interop.k8s.INTEROP_K8S_QUERY_PROFILE,
  id: 'interop-k8s-scheduled-notification-scheduler',
  applicationLogsQueryProfileId: 'interop-k8s-scheduled-notification-scheduler-application-log',
  buildApplicationLogsQuery,
};
