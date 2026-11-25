import { interop } from '../../../../toolkits/interop/index.js';

/** Exact writer; select errors in the application log rather than unrelated JSON metadata. */
export const PLATFORMSTATE_WRITER_QUERY_PROFILE: interop.k8s.InteropK8sQueryProfile =
  interop.k8s.interopK8sExactPodQueryProfile('interop-k8s-catalog-platformstate-writer', {
    applicationLogsQueryProfileId: 'interop-k8s-catalog-platformstate-writer-application-log',
    display: 'cid-with-stream',
  });
