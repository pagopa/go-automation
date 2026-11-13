import { interop } from '../../../../toolkits/interop/index.js';

export const BFF_QUERY_PROFILE: interop.k8s.InteropK8sQueryProfile = interop.k8s.interopK8sExactPodQueryProfile(
  'interop-bff',
  {
    applicationLogsQueryProfileId: 'interop-bff-errors',
  },
);
