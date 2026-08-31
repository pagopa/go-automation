import { SELFCARE_ONBOARDING_CONSUMER_ALARM } from './alarmDefinition.js';
import { interop } from '../framework.js';
import type { Runbook } from '../framework.js';

import { KNOWN_CASES } from './knownCases.js';

export function buildK8sInteropBeSelfcareOnboardingConsumerErrorsRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    id: SELFCARE_ONBOARDING_CONSUMER_ALARM.runbookKey,
    metadata: {
      name: SELFCARE_ONBOARDING_CONSUMER_ALARM.runbookKey,
      description:
        'Analizza gli allarmi k8s INTEROP del selfcare onboarding consumer leggendo i log applicativi, estraendo i CID e consultando il CID tracker.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'selfcare', 'onboarding', 'kafka'],
    },
    service: {
      name: SELFCARE_ONBOARDING_CONSUMER_ALARM.podApp,
      logGroup: SELFCARE_ONBOARDING_CONSUMER_ALARM.logGroup,
      varPrefix: SELFCARE_ONBOARDING_CONSUMER_ALARM.varPrefix,
    },
    resolveAlarmContext: SELFCARE_ONBOARDING_CONSUMER_ALARM.resolveContext,
    knownCases: KNOWN_CASES,
    occurrenceTimeWindow: { beforeMinutes: 5, afterMinutes: 1 },
  });
}
