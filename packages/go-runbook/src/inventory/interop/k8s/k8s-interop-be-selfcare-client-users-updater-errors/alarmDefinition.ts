import { defineInteropK8sAlarm, type InteropK8sAlarm } from '../../../../toolkits/interop/index.js';

/** The `interop-be-selfcare-client-users-updater` INTEROP k8s alarm. */
export const SELFCARE_USERS_UPDATER_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-selfcare-client-users-updater-errors',
  podApp: 'interop-be-selfcare-client-users-updater',
  varPrefix: 'interopSelfcareUsersUpdater',
});
