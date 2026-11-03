import { escapeLogsInsightsString } from '@go-automation/go-common/aws';
import { interop } from '../framework.js';

/** Match the application log field and the exact service; keep the documented CID chronology. */
export const NOTIFICATION_USER_LIFECYCLE_QUERY_PROFILE: interop.k8s.InteropK8sQueryProfile = {
  ...interop.k8s.INTEROP_K8S_QUERY_PROFILE,
  id: 'interop-notification-user-lifecycle',
  applicationLogsQueryProfileId: 'interop-notification-user-lifecycle-errors',
  buildApplicationLogsQuery: (podApp) => `filter (log like /ERROR/ or stream = "stderr")
| filter @logStream not like /adot-collector/
| filter pod_app = "${escapeLogsInsightsString(podApp)}"
| parse @message "[CID=*]" as cid
| display @timestamp, pod_app, cid, @message
| sort @timestamp asc`,
  cidTrackerQueryProfileId: 'interop-notification-user-lifecycle-cid-tracker',
  buildCidTrackerQuery: (cid) => `parse @message "[CID=*]" as cid
| filter cid = "${escapeLogsInsightsString(cid)}"
| parse log /(?<date>^[^\\s]+)/
| sort date asc
| display @timestamp, date, pod_app, cid, stream, log, @message`,
};
