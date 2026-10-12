/**
 * Runbook: pn-national-registries-InfoCamere-downstream-detection-Alarm
 */

import { downstream } from '../framework.js';
import type { Runbook } from '../framework.js';

import { KNOWN_CASES } from './knownCases.js';
import { DOWNSTREAM, SERVICE } from './knownServices.js';

/** Builds the pn-national-registries InfoCamere downstream-detection runbook. */
export function buildRunbook(): Runbook {
  return downstream.createDownstreamAlarmRunbook({
    id: 'pn-national-registries-InfoCamere-downstream-detection-Alarm',
    metadata: {
      name: 'pn-national-registries-InfoCamere-downstream-detection-Alarm',
      description:
        'Gestire in modo standardizzato gli allarmi generati dagli errori del downstream InfoCamere sul microservizio pn-national-registries.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['service', 'pn-national-registries', 'downstream', 'InfoCamere'],
    },
    service: SERVICE,
    downstream: DOWNSTREAM,
    knownCases: KNOWN_CASES,
    analysisDefaults: {
      runbookName: 'pn-national-registries-InfoCamere-downstream-detection-Alarm',
      links: [
        {
          url: 'https://pagopa.atlassian.net/wiki/spaces/GO/pages/2981101710/pn-national-registries-InfoCamere-downstream-detection-Alarm',
          name: 'pn-national-registries-InfoCamere-downstream-detection-Alarm',
          type: 'CONFLUENCE',
        },
      ],
    },
    occurrenceTimeWindow: {
      beforeMinutes: 10,
      afterMinutes: 5,
    },
  });
}
