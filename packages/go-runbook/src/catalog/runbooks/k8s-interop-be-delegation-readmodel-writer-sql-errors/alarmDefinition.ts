import { defineInteropK8sAlarm, type InteropK8sAlarm } from '../interop/defineInteropK8sAlarm.js';

/** The `interop-be-delegation-readmodel-writer-sql` INTEROP k8s alarm. */
export const DELEGATION_READMODEL_WRITER_SQL_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-delegation-readmodel-writer-sql-errors',
  podApp: 'interop-be-delegation-readmodel-writer-sql',
  varPrefix: 'interopDelegationReadmodelWriterSql',
});
