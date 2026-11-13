import { interop } from '../../../../toolkits/interop/index.js';

/** Match the documented log field and exact production service; retain chronological CID traces. */
export const TENANT_KIND_HISTORY_QUERY_PROFILE: interop.k8s.InteropK8sQueryProfile =
  interop.k8s.interopK8sExactPodQueryProfile('interop-tenant-kind-history-prod', {
    applicationLogsQueryProfileId: 'interop-tenant-kind-history-prod-errors',
    namespace: 'prod',
  });
