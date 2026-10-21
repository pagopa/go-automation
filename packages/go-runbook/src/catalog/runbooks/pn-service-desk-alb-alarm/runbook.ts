/**
 * Runbook: pn-service-desk-alb-alarm
 */

import { service } from '../framework.js';
import type { Runbook } from '../framework.js';

import { SERVICE } from './knownServices.js';
import { KNOWN_CASES } from './knownCases.js';

/**
 * Builds the pn-service-desk-alb-alarm runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return service.createServiceAlarmRunbook({
    id: 'pn-service-desk-alb-alarm',
    metadata: {
      name: 'pn-service-desk-alb-alarm',
      description: 'Analizza gli errori applicativi di pn-service-desk associati all’allarme ALB.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['service', 'pn-service-desk', 'alb'],
    },
    service: SERVICE,
    knownCases: KNOWN_CASES,
    occurrenceTimeWindow: { beforeMinutes: 5, afterMinutes: 5 },
    analysisDefaults: {
      runbookName: 'pn-service-desk-alb-alarm',
      links: [
        {
          url: 'https://pagopa.atlassian.net/wiki/spaces/GO/pages/2924347748/pn-service-desk-alb-alarm',
          name: 'pn-service-desk-alb-alarm',
          type: 'CONFLUENCE',
        },
      ],
    },
  });
}
