import { defineInteropK8sAlarm } from '../interop/defineInteropK8sAlarm.js';
import type { InteropK8sAlarm } from '../interop/defineInteropK8sAlarm.js';

/** The `interop-be-selfcare-client-users-updater` INTEROP k8s alarm. */
export const SELFCARE_USERS_UPDATER_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-selfcare-client-users-updater-errors',
  podApp: 'interop-be-selfcare-client-users-updater',
  varPrefix: 'interopSelfcareUsersUpdater',
});
