import { defineInteropK8sAlarm, type InteropK8sAlarm } from '../interop/defineInteropK8sAlarm.js';

/** The `interop-be-delegation-items-archiver` INTEROP k8s alarm in every environment. */
export const DELEGATION_ITEMS_ARCHIVER_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-delegation-items-archiver-errors',
  podApp: 'interop-be-delegation-items-archiver',
  varPrefix: 'interopDelegationItemsArchiver',
});
