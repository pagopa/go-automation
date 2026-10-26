import { escapeLogsInsightsString } from '@go-automation/go-common/aws';
import type { interop } from '../framework.js';
import { buildInteropK8sCidTrackerQuery } from '../../../interop/k8s/queries/interopK8sQueries.js';

export const STRAPI_QUERY_PROFILE: interop.k8s.InteropK8sQueryProfile = {
  id: 'interop-public-catalog-strapi',
  applicationLogsQueryProfileId: 'interop-public-catalog-strapi-errors',
  cidTrackerQueryProfileId: 'interop-k8s-cid-tracker',
  // Raw Strapi startup warnings/stack traces have no standard INTEROP prefix.
  buildApplicationLogsQuery: (podApp) => `fields @timestamp, pod_app, pod_namespace, @logStream, stream, log, @message
| filter pod_app = "${escapeLogsInsightsString(podApp)}"
| filter @logStream not like /adot-collector/
| filter log like /ERROR/ or stream = "stderr"
| parse @message "[CID=*]" as cid
| sort @timestamp asc`,
  buildCidTrackerQuery: buildInteropK8sCidTrackerQuery,
};
