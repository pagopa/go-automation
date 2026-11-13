import { defineInteropK8sAlarm, type InteropK8sAlarm } from '../../../../toolkits/interop/index.js';

/** The `interop-be-notifier` INTEROP k8s alarm. */
export const NOTIFIER_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-notifier-errors',
  podApp: 'interop-be-notifier',
  varPrefix: 'interopNotifier',
});
