import { escapeLogsInsightsString } from '@go-automation/go-common/aws';

import { interop } from '../framework.js';

/** Match the actual ERROR/log or stderr metric filter and the exact updater pod. */
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

export const ESERVICE_TEMPLATE_INSTANCES_UPDATER_QUERY_PROFILE: interop.k8s.InteropK8sQueryProfile = {
  ...interop.k8s.INTEROP_K8S_QUERY_PROFILE,
  id: 'interop-k8s-eservice-template-instances-updater',
  applicationLogsQueryProfileId: 'interop-k8s-eservice-template-instances-updater-application-log',
  buildApplicationLogsQuery,
};
