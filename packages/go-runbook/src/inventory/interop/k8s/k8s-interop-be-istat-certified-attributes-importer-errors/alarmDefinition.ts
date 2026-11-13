import { defineInteropK8sAlarm, type InteropK8sAlarm } from '../../../../toolkits/interop/index.js';

export const ISTAT_IMPORTER_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-istat-certified-attributes-importer-errors',
  podApp: 'interop-be-istat-certified-attributes-importer',
  varPrefix: 'interopIstatImporter',
});
