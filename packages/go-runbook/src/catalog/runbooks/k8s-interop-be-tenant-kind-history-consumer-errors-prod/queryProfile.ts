import { escapeLogsInsightsString } from '@go-automation/go-common/aws';
import { interop } from '../framework.js';

/** Match the documented log field and exact production service; retain chronological CID traces. */
export const TENANT_KIND_HISTORY_QUERY_PROFILE: interop.k8s.InteropK8sQueryProfile = {
  ...interop.k8s.INTEROP_K8S_QUERY_PROFILE,
  id: 'interop-tenant-kind-history-prod',
  applicationLogsQueryProfileId: 'interop-tenant-kind-history-prod-errors',
  buildApplicationLogsQuery: (podApp) => `filter (log like /ERROR/ or stream = "stderr")
| filter @logStream not like /adot-collector/
| filter pod_namespace = "prod" and pod_app = "${escapeLogsInsightsString(podApp)}"
| parse @message "[CID=*]" as cid
| display @timestamp, pod_app, cid, @message
| sort @timestamp asc`,
};
