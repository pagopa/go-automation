import { defineInteropK8sAlarm, type InteropK8sAlarm } from '../../../../toolkits/interop/index.js';

export const ONE_TRUST_NOTICES_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-one-trust-notices-errors-prod',
  podApp: 'interop-be-one-trust-notices',
  varPrefix: 'interopOneTrustNotices',
  environments: ['prod'],
  alarmName: (runbookKey) => runbookKey,
});
