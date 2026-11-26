import { BFF_ALARM } from './alarmDefinition.js';
import { interop } from '../../../../toolkits/interop/index.js';
import type { Runbook } from '../../../../engine/index.js';

import { KNOWN_CASES } from './knownCases.js';
import { BFF_QUERY_PROFILE } from './queryProfile.js';
import { AnalyzeBffEvidenceStep } from './AnalyzeBffEvidenceStep.js';

/**
 * Builds the k8s-interop-be-backend-for-frontend-errors runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    alarm: BFF_ALARM,
    metadata: {
      name: BFF_ALARM.runbookKey,
      description:
        'Analizza gli allarmi k8s INTEROP del backend-for-frontend leggendo i log applicativi, estraendo i CID e consultando il CID tracker.',
      version: '1.0.1',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'backend-for-frontend'],
    },
    queryProfile: BFF_QUERY_PROFILE,
    hooks: [{ at: 'before-cid-analysis', step: new AnalyzeBffEvidenceStep() }],
    knownCases: KNOWN_CASES,
    analysisDefaults: {
      links: [
        {
          url: 'https://pagopa.atlassian.net/wiki/spaces/GO/pages/2585559041/k8s-interop-be-backend-for-frontend-errors-prod',
          name: 'Runbook BFF k8s',
          type: 'CONFLUENCE',
        },
      ],
    },
  });
}
