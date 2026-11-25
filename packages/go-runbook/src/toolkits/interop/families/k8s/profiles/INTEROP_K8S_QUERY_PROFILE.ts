import {
  buildInteropK8sApplicationLogsQuery,
  buildInteropK8sCidTrackerQuery,
} from '../../../applicationLogs/queries/interopK8sQueries.js';
import {
  INTEROP_APPLICATION_LOGS_QUERY_PROFILE_ID,
  INTEROP_CID_TRACKER_QUERY_PROFILE_ID,
} from '../../../applicationLogs/queries/interopApplicationLogsQueryProfileIds.js';
import type { InteropK8sQueryProfile } from './InteropK8sQueryProfile.js';

export const INTEROP_K8S_QUERY_PROFILE: InteropK8sQueryProfile = {
  id: 'interop-k8s',
  applicationLogsQueryProfileId: INTEROP_APPLICATION_LOGS_QUERY_PROFILE_ID,
  cidTrackerQueryProfileId: INTEROP_CID_TRACKER_QUERY_PROFILE_ID,
  buildApplicationLogsQuery: buildInteropK8sApplicationLogsQuery,
  buildCidTrackerQuery: buildInteropK8sCidTrackerQuery,
};
