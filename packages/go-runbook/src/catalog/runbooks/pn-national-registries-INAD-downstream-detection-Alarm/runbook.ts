/**
 * Runbook: pn-national-registries-INAD-downstream-detection-Alarm
 */

import { downstream } from '../framework.js';
import type { Runbook } from '../framework.js';

import { KNOWN_CASES } from './knownCases.js';
import { DOWNSTREAM, SERVICE } from './knownServices.js';

/** Builds the pn-national-registries INAD downstream-detection runbook. */
export function buildRunbook(): Runbook {
  return downstream.createDownstreamAlarmRunbook({
    id: 'pn-national-registries-INAD-downstream-detection-Alarm',
    metadata: {
      name: 'pn-national-registries-INAD-downstream-detection-Alarm',
      description:
        'Gestire in modo standardizzato gli allarmi generati dagli errori del downstream INAD sul microservizio pn-national-registries.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['service', 'pn-national-registries', 'downstream', 'INAD'],
    },
    service: SERVICE,
    downstream: DOWNSTREAM,
    knownCases: KNOWN_CASES,
    analysisDefaults: {
      runbookName: 'pn-national-registries-INAD-downstream-detection-Alarm',
      links: [
        {
          url: 'https://pagopa.atlassian.net/wiki/spaces/GO/pages/2363785411/pn-national-registries-INAD-downstream-detection-Alarm',
          name: 'pn-national-registries-INAD-downstream-detection-Alarm',
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
