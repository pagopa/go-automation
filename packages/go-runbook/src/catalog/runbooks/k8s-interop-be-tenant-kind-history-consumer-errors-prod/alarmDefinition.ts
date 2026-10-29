import { defineInteropK8sAlarm, type InteropK8sAlarm } from '../interop/defineInteropK8sAlarm.js';

/** The source page documents this alarm in production only. */
export const TENANT_KIND_HISTORY_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-tenant-kind-history-consumer-errors-prod',
  podApp: 'interop-be-tenant-kind-history-consumer',
  varPrefix: 'interopTenantKindHistory',
  environments: ['prod'],
  alarmName: (runbookKey) => runbookKey,
});
