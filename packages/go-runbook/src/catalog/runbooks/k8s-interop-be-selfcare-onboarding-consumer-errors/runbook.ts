import { SELFCARE_ONBOARDING_CONSUMER_ALARM } from './alarmDefinition.js';
import { interop } from '../framework.js';
import type { Runbook } from '../framework.js';

import { KNOWN_CASES } from './knownCases.js';
import { SELFCARE_ONBOARDING_QUERY_PROFILE } from './queryProfile.js';

export function buildRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    id: SELFCARE_ONBOARDING_CONSUMER_ALARM.runbookKey,
    metadata: {
      name: SELFCARE_ONBOARDING_CONSUMER_ALARM.runbookKey,
      description:
        'Analizza gli allarmi k8s INTEROP del selfcare onboarding consumer leggendo i log applicativi, estraendo i CID e consultando il CID tracker.',
      version: '1.0.1',
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
    queryProfile: SELFCARE_ONBOARDING_QUERY_PROFILE,
    knownCases: KNOWN_CASES,
    occurrenceTimeWindow: { beforeMinutes: 5, afterMinutes: 1 },
    analysisDefaults: {
      links: [
        {
          url: 'https://pagopa.atlassian.net/wiki/spaces/GO/pages/2145419266/k8s-interop-be-selfcare-onboarding-consumer-errors-prod',
          name: 'Runbook Selfcare onboarding consumer',
          type: 'CONFLUENCE',
        },
      ],
    },
  });
}
