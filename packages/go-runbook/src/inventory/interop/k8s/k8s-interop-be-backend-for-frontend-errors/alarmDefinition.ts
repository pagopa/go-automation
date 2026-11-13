import { defineInteropK8sAlarm, type InteropK8sAlarm } from '../../../../toolkits/interop/index.js';

/** The `interop-be-backend-for-frontend` INTEROP k8s alarm. */
export const BFF_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-backend-for-frontend-errors',
  podApp: 'interop-be-backend-for-frontend',
  varPrefix: 'interopBff',
});
