import { defineInteropK8sAlarm, type InteropK8sAlarm } from '../interop/defineInteropK8sAlarm.js';

/** The `interop-be-in-app-notification-dispatcher` INTEROP k8s alarm. */
export const IN_APP_NOTIFICATION_DISPATCHER_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-in-app-notification-dispatcher-errors',
  podApp: 'interop-be-in-app-notification-dispatcher',
  varPrefix: 'interopInAppNotificationDispatcher',
});
