import { interop } from '../../../../toolkits/interop/index.js';

/** Select the exact writer using the ERROR/log or stderr metric filter read in AWS. */
export const CATALOG_READMODEL_WRITER_SQL_QUERY_PROFILE: interop.k8s.InteropK8sQueryProfile =
  interop.k8s.interopK8sExactPodQueryProfile('interop-k8s-catalog-readmodel-writer-sql', {
    applicationLogsQueryProfileId: 'interop-k8s-catalog-readmodel-writer-sql-application-log',
  });
