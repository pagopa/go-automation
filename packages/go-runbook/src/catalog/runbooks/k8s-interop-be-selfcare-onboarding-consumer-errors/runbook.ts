import { interop } from '../framework.js';
import type { Runbook } from '../framework.js';

import { KNOWN_CASES } from './knownCases.js';
import {
  INTEROP_SELFCARE_ONBOARDING_CONSUMER_RUNBOOK_KEY,
  INTEROP_SELFCARE_ONBOARDING_CONSUMER_SERVICE_NAME,
  INTEROP_SELFCARE_ONBOARDING_CONSUMER_STATIC_LOG_GROUP,
  INTEROP_SELFCARE_ONBOARDING_CONSUMER_VAR_PREFIX,
  resolveInteropSelfcareOnboardingConsumerAlarmContext,
} from './resolveInteropAlarmContext.js';

export function buildK8sInteropBeSelfcareOnboardingConsumerErrorsRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    id: INTEROP_SELFCARE_ONBOARDING_CONSUMER_RUNBOOK_KEY,
    metadata: {
      name: INTEROP_SELFCARE_ONBOARDING_CONSUMER_RUNBOOK_KEY,
      description:
        'Analizza gli allarmi k8s INTEROP del selfcare onboarding consumer leggendo i log applicativi, estraendo i CID e consultando il CID tracker.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'selfcare', 'onboarding', 'kafka'],
    },
    service: {
      name: INTEROP_SELFCARE_ONBOARDING_CONSUMER_SERVICE_NAME,
      logGroup: INTEROP_SELFCARE_ONBOARDING_CONSUMER_STATIC_LOG_GROUP,
      varPrefix: INTEROP_SELFCARE_ONBOARDING_CONSUMER_VAR_PREFIX,
    },
    resolveAlarmContext: resolveInteropSelfcareOnboardingConsumerAlarmContext,
    knownCases: KNOWN_CASES,
    occurrenceTimeWindow: { beforeMinutes: 5, afterMinutes: 1 },
  });
}
