/**
 * Runbook: pn-national-registries-IPA-downstream-detection-Alarm
 */

import { downstream } from '../framework.js';
import type { Runbook } from '../framework.js';

import { KNOWN_CASES } from './knownCases.js';
import { DOWNSTREAM, SERVICE } from './knownServices.js';

/** Builds the pn-national-registries IPA downstream-detection runbook. */
export function buildRunbook(): Runbook {
  return downstream.createDownstreamAlarmRunbook({
    id: 'pn-national-registries-IPA-downstream-detection-Alarm',
    metadata: {
      name: 'pn-national-registries-IPA-downstream-detection-Alarm',
      description:
        'Gestire in modo standardizzato gli allarmi generati dagli errori del downstream IPA sul microservizio pn-national-registries.',
      version: '1.0.1',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['service', 'pn-national-registries', 'downstream', 'IPA'],
    },
    service: SERVICE,
    downstream: DOWNSTREAM,
    knownCases: KNOWN_CASES,
    analysisDefaults: {
      runbookName: 'pn-national-registries-IPA-downstream-detection-Alarm',
      links: [
        {
          url: 'https://pagopa.atlassian.net/wiki/spaces/GO/pages/2386001921/pn-national-registries-IPA-downstream-detection-Alarm',
          name: 'pn-national-registries-IPA-downstream-detection-Alarm',
          type: 'CONFLUENCE',
        },
      ],
    },
    occurrenceTimeWindow: {
      // Six 5-minute evaluation periods, as clarified by Gaspare in Confluence.
      beforeMinutes: 30,
      afterMinutes: 5,
    },
  });
}
