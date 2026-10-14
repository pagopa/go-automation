import { defineInteropK8sAlarm } from '../interop/defineInteropK8sAlarm.js';
import type { InteropK8sAlarm } from '../interop/defineInteropK8sAlarm.js';

/** The `interop-be-scheduled-notification-scheduler` INTEROP k8s alarm. */
export const NOTIFICATION_SCHEDULER_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-scheduled-notification-scheduler-errors',
  podApp: 'interop-be-scheduled-notification-scheduler',
  varPrefix: 'interopNotificationScheduler',
});
