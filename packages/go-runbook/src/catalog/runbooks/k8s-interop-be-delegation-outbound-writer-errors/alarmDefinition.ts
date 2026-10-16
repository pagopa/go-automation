import { defineInteropK8sAlarm, type InteropK8sAlarm } from '../interop/defineInteropK8sAlarm.js';

/** The `interop-be-delegation-outbound-writer` INTEROP k8s alarm in every environment. */
export const DELEGATION_OUTBOUND_WRITER_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-delegation-outbound-writer-errors',
  podApp: 'interop-be-delegation-outbound-writer',
  varPrefix: 'interopDelegationOutboundWriter',
});
