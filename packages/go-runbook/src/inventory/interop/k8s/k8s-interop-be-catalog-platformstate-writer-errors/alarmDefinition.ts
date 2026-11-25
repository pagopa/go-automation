import { defineInteropK8sAlarm, type InteropK8sAlarm } from '../../../../toolkits/interop/index.js';

/** The `interop-be-catalog-platformstate-writer` INTEROP k8s alarm. */
export const CATALOG_PLATFORMSTATE_WRITER_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-catalog-platformstate-writer-errors',
  podApp: 'interop-be-catalog-platformstate-writer',
  varPrefix: 'interopCatalogPlatformstateWriter',
});
