import { defineInteropK8sAlarm } from '../interop/defineInteropK8sAlarm.js';
import type { InteropK8sAlarm } from '../interop/defineInteropK8sAlarm.js';

/** The `interop-be-purpose-outbound-writer` INTEROP k8s alarm. */
export const PURPOSE_OUTBOUND_WRITER_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-purpose-outbound-writer-errors',
  podApp: 'interop-be-purpose-outbound-writer',
  varPrefix: 'interopPurposeOutboundWriter',
});
