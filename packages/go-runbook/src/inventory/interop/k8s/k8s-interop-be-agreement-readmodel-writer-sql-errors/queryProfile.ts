import { interop } from '../../../../toolkits/interop/index.js';

/** Select the exact writer using the ERROR/log or stderr criterion read in AWS. */
export const AGREEMENT_READMODEL_WRITER_SQL_QUERY_PROFILE: interop.k8s.InteropK8sQueryProfile =
  interop.k8s.interopK8sExactPodQueryProfile('interop-k8s-agreement-readmodel-writer-sql', {
    applicationLogsQueryProfileId: 'interop-k8s-agreement-readmodel-writer-sql-application-log',
  });
