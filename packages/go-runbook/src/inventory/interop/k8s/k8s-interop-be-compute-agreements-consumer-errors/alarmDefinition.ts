import { defineInteropK8sAlarm, type InteropK8sAlarm } from '../../../../toolkits/interop/index.js';

/** The `interop-be-compute-agreements-consumer` INTEROP k8s alarm. */
export const COMPUTE_AGREEMENTS_CONSUMER_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-compute-agreements-consumer-errors',
  podApp: 'interop-be-compute-agreements-consumer',
  varPrefix: 'interopComputeAgreementsConsumer',
});
