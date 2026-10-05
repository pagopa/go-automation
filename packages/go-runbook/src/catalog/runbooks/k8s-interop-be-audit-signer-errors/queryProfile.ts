import { escapeLogsInsightsString } from '@go-automation/go-common/aws';

import { interop } from '../framework.js';

/** Match the actual ErrorCount filter's log/stderr criterion and the exact pod. */
export function buildApplicationLogsQuery(podApp: string): string {
  return `
filter (log like /ERROR/ or stream = "stderr")
| filter @logStream not like /adot-collector/
| filter pod_app = "${escapeLogsInsightsString(podApp)}"
| parse @message "[CID=*]" as cid
| display @timestamp, pod_app, cid, @message
| sort @timestamp asc
`.trim();
}

export const AUDIT_SIGNER_QUERY_PROFILE: interop.k8s.InteropK8sQueryProfile = {
  ...interop.k8s.INTEROP_K8S_QUERY_PROFILE,
  id: 'interop-k8s-audit-signer',
  applicationLogsQueryProfileId: 'interop-k8s-audit-signer-application-log',
  buildApplicationLogsQuery,
};
