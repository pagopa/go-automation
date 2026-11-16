import { defineInteropK8sAlarm, type InteropK8sAlarm } from '../../../../toolkits/interop/index.js';

/** The `interop-be-attribute-registry-readmodel-writer-sql` INTEROP k8s alarm. */
export const ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-attribute-registry-readmodel-writer-sql-errors',
  podApp: 'interop-be-attribute-registry-readmodel-writer-sql',
  varPrefix: 'interopAttributeRegistryReadmodelWriterSql',
});
