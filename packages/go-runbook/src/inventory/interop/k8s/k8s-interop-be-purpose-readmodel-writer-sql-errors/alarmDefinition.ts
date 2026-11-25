import { defineInteropK8sAlarm, type InteropK8sAlarm } from '../../../../toolkits/interop/index.js';

/** The `interop-be-purpose-readmodel-writer-sql` INTEROP k8s alarm in every environment. */
export const PURPOSE_READMODEL_WRITER_SQL_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-purpose-readmodel-writer-sql-errors',
  podApp: 'interop-be-purpose-readmodel-writer-sql',
  varPrefix: 'interopPurposeReadmodelWriterSql',
});
