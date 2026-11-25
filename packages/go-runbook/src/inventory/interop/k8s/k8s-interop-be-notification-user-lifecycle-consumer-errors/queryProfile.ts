import { interop } from '../../../../toolkits/interop/index.js';

/** Match the application log field and the exact service; keep the documented CID chronology. */
export const NOTIFICATION_USER_LIFECYCLE_QUERY_PROFILE: interop.k8s.InteropK8sQueryProfile =
  interop.k8s.interopK8sExactPodQueryProfile('interop-notification-user-lifecycle', {
    applicationLogsQueryProfileId: 'interop-notification-user-lifecycle-errors',
    datedCidTracker: { queryProfileId: 'interop-notification-user-lifecycle-cid-tracker' },
  });
