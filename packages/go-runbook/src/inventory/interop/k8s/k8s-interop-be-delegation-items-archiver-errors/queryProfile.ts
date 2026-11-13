import { interop } from '../../../../toolkits/interop/index.js';

export const ARCHIVER_QUERY_PROFILE: interop.k8s.InteropK8sQueryProfile = interop.k8s.interopK8sExactPodQueryProfile(
  'interop-k8s-delegation-items-archiver',
  {
    applicationLogsQueryProfileId: 'interop-k8s-delegation-items-archiver-errors',
    form: 'fields',
  },
);
