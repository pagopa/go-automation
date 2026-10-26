import { defineInteropK8sAlarm } from '../interop/defineInteropK8sAlarm.js';
import type { InteropK8sAlarm } from '../interop/defineInteropK8sAlarm.js';

export const M2M_EVENT_DISPATCHER_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-m2m-event-dispatcher-errors-prod',
  podApp: 'interop-be-m2m-event-dispatcher',
  varPrefix: 'interopM2mEventDispatcher',
  environments: ['prod'],
  alarmName: (runbookKey) => runbookKey,
});
