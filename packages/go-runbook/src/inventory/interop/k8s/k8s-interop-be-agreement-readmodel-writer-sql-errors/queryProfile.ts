import { escapeLogsInsightsString } from '@pagopa/go-aws/cloudwatch-logs/insights';

import { interop } from '../../../../toolkits/interop/index.js';

/** Select the exact writer using the ERROR/log or stderr criterion read in AWS. */
function buildApplicationLogsQuery(podApp: string): string {
  return `
filter (log like /ERROR/ or stream = "stderr")
| filter @logStream not like /adot-collector/
| filter pod_app = "${escapeLogsInsightsString(podApp)}"
| parse @message "[CID=*]" as cid
| display @timestamp, pod_app, cid, @message
| sort @timestamp asc
`.trim();
}

export const AGREEMENT_READMODEL_WRITER_SQL_QUERY_PROFILE: interop.k8s.InteropK8sQueryProfile = {
  ...interop.k8s.INTEROP_K8S_QUERY_PROFILE,
  id: 'interop-k8s-agreement-readmodel-writer-sql',
  applicationLogsQueryProfileId: 'interop-k8s-agreement-readmodel-writer-sql-application-log',
  buildApplicationLogsQuery,
};
