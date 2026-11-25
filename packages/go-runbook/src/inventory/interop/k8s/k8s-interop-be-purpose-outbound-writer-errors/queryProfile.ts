import { interop } from '../../../../toolkits/interop/index.js';

/** Exact writer; select errors in the application log rather than unrelated JSON metadata. */
export const PURPOSE_OUTBOUND_WRITER_QUERY_PROFILE: interop.k8s.InteropK8sQueryProfile =
  interop.k8s.interopK8sExactPodQueryProfile('interop-k8s-purpose-outbound-writer', {
    applicationLogsQueryProfileId: 'interop-k8s-purpose-outbound-writer-application-log',
    display: 'cid-with-stream',
  });
