import { defineInteropK8sAlarm, type InteropK8sAlarm } from '../interop/defineInteropK8sAlarm.js';

/** The `interop-be-tenant-readmodel-writer-sql` INTEROP k8s alarm in every environment. */
export const TENANT_READMODEL_WRITER_SQL_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-tenant-readmodel-writer-sql-errors',
  podApp: 'interop-be-tenant-readmodel-writer-sql',
  varPrefix: 'interopTenantReadmodelWriterSql',
});
