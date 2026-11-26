import { interop } from '../../../../toolkits/interop/index.js';

/** Match the actual ErrorCount filter's log/stderr criterion and the exact pod. */
export const M2M_AUDIT_SIGNER_QUERY_PROFILE: interop.k8s.InteropK8sQueryProfile =
  interop.k8s.interopK8sExactPodQueryProfile('interop-k8s-m2m-audit-signer', {
    applicationLogsQueryProfileId: 'interop-k8s-m2m-audit-signer-application-log',
  });
