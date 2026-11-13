import { interop } from '../../../../toolkits/interop/index.js';

/** Select the exact writer using the ERROR/log or stderr metric filter read in AWS. */
export const ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_QUERY_PROFILE: interop.k8s.InteropK8sQueryProfile =
  interop.k8s.interopK8sExactPodQueryProfile('interop-k8s-attribute-registry-readmodel-writer-sql', {
    applicationLogsQueryProfileId: 'interop-k8s-attribute-registry-readmodel-writer-sql-application-log',
  });
