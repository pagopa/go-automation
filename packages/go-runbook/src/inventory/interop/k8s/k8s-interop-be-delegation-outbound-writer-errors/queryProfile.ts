import { interop } from '../../../../toolkits/interop/index.js';

export const DELEGATION_OUTBOUND_WRITER_QUERY_PROFILE: interop.k8s.InteropK8sQueryProfile =
  interop.k8s.interopK8sExactPodQueryProfile('interop-k8s-delegation-outbound-writer', {
    applicationLogsQueryProfileId: 'interop-k8s-delegation-outbound-writer-errors',
    form: 'fields',
  });
