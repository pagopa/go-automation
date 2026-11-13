import { defineInteropK8sAlarm, type InteropK8sAlarm } from '../../../../toolkits/interop/index.js';

/** The `interop-be-selfcare-onboarding-consumer` INTEROP k8s alarm. */
export const SELFCARE_ONBOARDING_CONSUMER_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-selfcare-onboarding-consumer-errors',
  podApp: 'interop-be-selfcare-onboarding-consumer',
  varPrefix: 'interopSelfcareOnboardingConsumer',
});
