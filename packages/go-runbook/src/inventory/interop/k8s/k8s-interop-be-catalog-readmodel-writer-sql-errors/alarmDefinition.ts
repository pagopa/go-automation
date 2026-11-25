import { defineInteropK8sAlarm, type InteropK8sAlarm } from '../../../../toolkits/interop/index.js';

/** The `interop-be-catalog-readmodel-writer-sql` INTEROP k8s alarm. */
export const CATALOG_READMODEL_WRITER_SQL_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-catalog-readmodel-writer-sql-errors',
  podApp: 'interop-be-catalog-readmodel-writer-sql',
  varPrefix: 'interopCatalogReadmodelWriterSql',
});
