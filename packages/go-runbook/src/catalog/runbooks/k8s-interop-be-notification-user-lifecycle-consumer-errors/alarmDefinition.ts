import { defineInteropK8sAlarm } from '../interop/defineInteropK8sAlarm.js';
import type { InteropK8sAlarm } from '../interop/defineInteropK8sAlarm.js';

/** The `interop-be-notification-user-lifecycle-consumer` INTEROP k8s alarm. */
export const NOTIFICATION_USER_LIFECYCLE_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-notification-user-lifecycle-consumer-errors',
  podApp: 'interop-be-notification-user-lifecycle-consumer',
  varPrefix: 'interopNotificationUserLifecycle',
});
