import { defineInteropK8sAlarm, type InteropK8sAlarm } from '../../../../toolkits/interop/index.js';

/** The `interop-be-scheduled-notification-scheduler` INTEROP k8s alarm. */
export const NOTIFICATION_SCHEDULER_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-scheduled-notification-scheduler-errors',
  podApp: 'interop-be-scheduled-notification-scheduler',
  varPrefix: 'interopNotificationScheduler',
});
