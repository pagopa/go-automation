import { defineInteropK8sAlarm, type InteropK8sAlarm } from '../../../../toolkits/interop/index.js';

export const M2M_EVENT_DISPATCHER_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-m2m-event-dispatcher-errors-prod',
  podApp: 'interop-be-m2m-event-dispatcher',
  varPrefix: 'interopM2mEventDispatcher',
  environments: ['prod'],
  alarmName: (runbookKey) => runbookKey,
});
