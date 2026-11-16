import { interop } from '../../../../toolkits/interop/index.js';

/** Follow the documented log/stderr criterion and select the exact checker pod. */
export const ASYNC_TOKEN_GENERATION_READMODEL_CHECKER_QUERY_PROFILE: interop.k8s.InteropK8sQueryProfile =
  interop.k8s.interopK8sExactPodQueryProfile('interop-k8s-async-token-generation-readmodel-checker', {
    applicationLogsQueryProfileId: 'interop-k8s-async-token-generation-readmodel-checker-application-log',
  });
