import { defineInteropK8sAlarm, type InteropK8sAlarm } from '../../../../toolkits/interop/index.js';

/** The `interop-be-ipa-certified-attributes-importer` INTEROP k8s alarm in every environment. */
export const IPA_IMPORTER_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-ipa-certified-attributes-importer-errors',
  podApp: 'interop-be-ipa-certified-attributes-importer',
  varPrefix: 'interopIpaImporter',
});
