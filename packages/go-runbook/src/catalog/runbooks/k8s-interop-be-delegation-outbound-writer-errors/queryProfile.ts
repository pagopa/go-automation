import { escapeLogsInsightsString } from '@go-automation/go-common/aws';
import { interop } from '../framework.js';

export const DELEGATION_OUTBOUND_WRITER_QUERY_PROFILE: interop.k8s.InteropK8sQueryProfile = {
  ...interop.k8s.INTEROP_K8S_QUERY_PROFILE,
  id: 'interop-k8s-delegation-outbound-writer',
  applicationLogsQueryProfileId: 'interop-k8s-delegation-outbound-writer-errors',
  buildApplicationLogsQuery: (podApp) => `fields @timestamp, pod_app, pod_namespace, @logStream, stream, log, @message
| filter pod_app = "${escapeLogsInsightsString(podApp)}"
| filter @logStream not like /adot-collector/
| filter log like /ERROR/ or stream = "stderr"
| parse @message "[CID=*]" as cid
| sort @timestamp asc`,
};
