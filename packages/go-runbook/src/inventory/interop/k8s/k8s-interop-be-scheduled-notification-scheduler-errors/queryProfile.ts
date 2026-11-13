import { interop } from '../../../../toolkits/interop/index.js';

/** Exact scheduler; select errors in the application log rather than unrelated JSON metadata. */
export const NOTIFICATION_SCHEDULER_QUERY_PROFILE: interop.k8s.InteropK8sQueryProfile =
  interop.k8s.interopK8sExactPodQueryProfile('interop-k8s-scheduled-notification-scheduler', {
    applicationLogsQueryProfileId: 'interop-k8s-scheduled-notification-scheduler-application-log',
    display: 'cid-with-stream',
  });
