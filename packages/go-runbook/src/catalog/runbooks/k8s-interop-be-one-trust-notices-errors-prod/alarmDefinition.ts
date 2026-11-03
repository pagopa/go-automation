import { defineInteropK8sAlarm } from '../interop/defineInteropK8sAlarm.js';
import type { InteropK8sAlarm } from '../interop/defineInteropK8sAlarm.js';

export const ONE_TRUST_NOTICES_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-one-trust-notices-errors-prod',
  podApp: 'interop-be-one-trust-notices',
  varPrefix: 'interopOneTrustNotices',
  environments: ['prod'],
  alarmName: (runbookKey) => runbookKey,
});
