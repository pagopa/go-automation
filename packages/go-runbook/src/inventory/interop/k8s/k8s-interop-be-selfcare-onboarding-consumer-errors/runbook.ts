import { SELFCARE_ONBOARDING_CONSUMER_ALARM } from './alarmDefinition.js';
import { interop } from '../../../../toolkits/interop/index.js';
import type { Runbook } from '../../../../engine/index.js';

import { KNOWN_ERRORS } from './knownErrors.js';
import { SELFCARE_ONBOARDING_QUERY_PROFILE } from './queryProfile.js';

/**
 * Builds the k8s-interop-be-selfcare-onboarding-consumer-errors runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    alarm: SELFCARE_ONBOARDING_CONSUMER_ALARM,
    metadata: {
      name: SELFCARE_ONBOARDING_CONSUMER_ALARM.runbookKey,
      description:
        'Analizza gli allarmi k8s INTEROP del selfcare onboarding consumer leggendo i log applicativi, estraendo i CID e consultando il CID tracker.',
      version: '1.0.1',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'selfcare', 'onboarding', 'kafka'],
    },
    queryProfile: SELFCARE_ONBOARDING_QUERY_PROFILE,
    knownErrors: KNOWN_ERRORS,
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
