import { defineInteropK8sAlarm, type InteropK8sAlarm } from '../../../../toolkits/interop/index.js';

/** The `interop-be-notification-user-lifecycle-consumer` INTEROP k8s alarm. */
export const NOTIFICATION_USER_LIFECYCLE_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-notification-user-lifecycle-consumer-errors',
  podApp: 'interop-be-notification-user-lifecycle-consumer',
  varPrefix: 'interopNotificationUserLifecycle',
});
