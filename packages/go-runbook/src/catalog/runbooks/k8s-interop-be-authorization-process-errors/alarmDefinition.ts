import { defineInteropK8sAlarm, type InteropK8sAlarm } from '../interop/defineInteropK8sAlarm.js';

/** The `interop-be-authorization-process` INTEROP k8s alarm in every environment. */
export const AUTHORIZATION_PROCESS_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-authorization-process-errors',
  podApp: 'interop-be-authorization-process',
  varPrefix: 'interopAuthorizationProcess',
});
