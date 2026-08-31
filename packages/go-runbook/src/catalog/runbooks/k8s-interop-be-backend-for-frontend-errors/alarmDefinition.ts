import { defineInteropK8sAlarm } from '../interop/defineInteropK8sAlarm.js';
import type { InteropK8sAlarm } from '../interop/defineInteropK8sAlarm.js';

/** The `interop-be-backend-for-frontend` INTEROP k8s alarm. */
export const BFF_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-backend-for-frontend-errors',
  podApp: 'interop-be-backend-for-frontend',
  varPrefix: 'interopBff',
});
