import { defineInteropK8sAlarm } from '../interop/defineInteropK8sAlarm.js';
import type { InteropK8sAlarm } from '../interop/defineInteropK8sAlarm.js';

/** The `interop-be-notifier` INTEROP k8s alarm. */
export const NOTIFIER_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-notifier-errors',
  podApp: 'interop-be-notifier',
  varPrefix: 'interopNotifier',
});
