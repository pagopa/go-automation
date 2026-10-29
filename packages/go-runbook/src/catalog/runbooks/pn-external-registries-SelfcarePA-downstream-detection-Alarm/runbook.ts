/**
 * Runbook: pn-external-registries-SelfcarePA-downstream-detection-Alarm
 */

import { service } from '../framework.js';
import type { Runbook } from '../framework.js';

import { SERVICE } from './knownServices.js';
import { KNOWN_CASES } from './knownCases.js';

/**
 * Builds the pn-external-registries-SelfcarePA-downstream-detection-Alarm runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return service.createServiceAlarmRunbook({
    id: 'pn-external-registries-SelfcarePA-downstream-detection-Alarm',
    metadata: {
      name: 'pn-external-registries-SelfcarePA-downstream-detection-Alarm',
      description: 'Diagnosi degli errori SelfcarePA su pn-external-registries e correlazione del trace_id',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['service', 'pn-external-registries', 'downstream', 'SelfcarePA'],
    },
    service: SERVICE,
    knownCases: KNOWN_CASES,
    // The latest observed errors begin over 34 minutes before the event.
    occurrenceTimeWindow: { beforeMinutes: 40, afterMinutes: 5 },
    analysisDefaults: {
      runbookName: 'pn-external-registries-SelfcarePA-downstream-detection-Alarm',
      finalActions: [],
      links: [
        {
          url: 'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3414851586/pn-external-registries-SelfcarePA-downstream-detection-Alarm',
          name: 'pn-external-registries-SelfcarePA-downstream-detection-Alarm',
          type: 'CONFLUENCE',
        },
      ],
    },
  });
}
