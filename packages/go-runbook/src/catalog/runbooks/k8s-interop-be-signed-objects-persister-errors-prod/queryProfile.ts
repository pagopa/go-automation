import { escapeLogsInsightsString } from '@go-automation/go-common/aws';
import { interop } from '../framework.js';

/** Follow the embedded application date in CID traces, as documented in the source. */
export const SIGNED_OBJECTS_PERSISTER_QUERY_PROFILE: interop.k8s.InteropK8sQueryProfile = {
  ...interop.k8s.INTEROP_K8S_QUERY_PROFILE,
  id: 'interop-signed-objects-persister',
  applicationLogsQueryProfileId: 'interop-signed-objects-persister-errors',
  buildApplicationLogsQuery: (podApp) => `filter (log like /ERROR/ or stream = "stderr")
| filter @logStream not like /adot-collector/
| filter pod_app = "${escapeLogsInsightsString(podApp)}"
| parse @message "[CID=*]" as cid
| display @timestamp, pod_app, cid, @message
| sort @timestamp asc
`,
  cidTrackerQueryProfileId: 'interop-signed-objects-persister-cid-tracker',
  buildCidTrackerQuery: (cid) => `parse @message "[CID=*]" as cid
| filter cid = "${escapeLogsInsightsString(cid)}"
| parse log /(?<date>^[^\\s]+)/
| sort date asc
| display @timestamp, date, pod_app, cid, stream, log, @message`,
};
