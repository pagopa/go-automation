import { defineInteropK8sAlarm } from '../interop/defineInteropK8sAlarm.js';
import type { InteropK8sAlarm } from '../interop/defineInteropK8sAlarm.js';

/** The `interop-be-selfcare-onboarding-consumer` INTEROP k8s alarm. */
export const SELFCARE_ONBOARDING_CONSUMER_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-selfcare-onboarding-consumer-errors',
  podApp: 'interop-be-selfcare-onboarding-consumer',
  varPrefix: 'interopSelfcareOnboardingConsumer',
});
