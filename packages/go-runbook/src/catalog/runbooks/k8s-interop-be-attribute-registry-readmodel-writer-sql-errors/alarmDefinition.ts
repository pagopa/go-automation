import { defineInteropK8sAlarm } from '../interop/defineInteropK8sAlarm.js';
import type { InteropK8sAlarm } from '../interop/defineInteropK8sAlarm.js';

/** The `interop-be-attribute-registry-readmodel-writer-sql` INTEROP k8s alarm. */
export const ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-attribute-registry-readmodel-writer-sql-errors',
  podApp: 'interop-be-attribute-registry-readmodel-writer-sql',
  varPrefix: 'interopAttributeRegistryReadmodelWriterSql',
});
