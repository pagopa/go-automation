import { interop } from '../../../../toolkits/interop/index.js';

/** Query the application error field and stderr for the exact service. */
export const SELFCARE_USERS_UPDATER_QUERY_PROFILE: interop.k8s.InteropK8sQueryProfile =
  interop.k8s.interopK8sExactPodQueryProfile('interop-selfcare-users-updater', {
    applicationLogsQueryProfileId: 'interop-selfcare-users-updater-errors',
  });
