import { defineInteropK8sAlarm, type InteropK8sAlarm } from '../../../../toolkits/interop/index.js';

/** The `interop-be-notifier-seeder` INTEROP k8s alarm in every environment. */
export const NOTIFIER_SEEDER_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-notifier-seeder-errors',
  podApp: 'interop-be-notifier-seeder',
  varPrefix: 'interopNotifierSeeder',
});
