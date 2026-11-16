import { interop } from '../../../../toolkits/interop/index.js';

/** Follow the embedded application date in CID traces, as documented in the source. */
export const SIGNED_OBJECTS_PERSISTER_QUERY_PROFILE: interop.k8s.InteropK8sQueryProfile =
  interop.k8s.interopK8sExactPodQueryProfile('interop-signed-objects-persister', {
    applicationLogsQueryProfileId: 'interop-signed-objects-persister-errors',
    datedCidTracker: { queryProfileId: 'interop-signed-objects-persister-cid-tracker' },
  });
