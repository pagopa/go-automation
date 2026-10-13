import { defineInteropK8sAlarm, type InteropK8sAlarm } from '../interop/defineInteropK8sAlarm.js';

/** The agreement readmodel writer SQL alarm; Prod and Collaudo verified in AWS. */
export const AGREEMENT_READMODEL_WRITER_SQL_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-agreement-readmodel-writer-sql-errors',
  podApp: 'interop-be-agreement-readmodel-writer-sql',
  varPrefix: 'interopAgreementReadmodelWriterSql',
});
