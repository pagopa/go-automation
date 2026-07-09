import { buildInteropK8sApplicationLogsQuery, buildInteropK8sCidTrackerQuery } from '../queries/interopK8sQueries.js';
import type { InteropK8sQueryProfile } from './InteropK8sQueryProfile.js';

export const INTEROP_K8S_QUERY_PROFILE: InteropK8sQueryProfile = {
  id: 'interop-k8s',
  applicationLogsQueryProfileId: 'interop-k8s-application-log',
  cidTrackerQueryProfileId: 'interop-k8s-cid-tracker',
  buildApplicationLogsQuery: buildInteropK8sApplicationLogsQuery,
  buildCidTrackerQuery: buildInteropK8sCidTrackerQuery,
};
