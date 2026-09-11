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
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['service', 'pn-national-registries', 'downstream', 'IPA'],
    },
    service: SERVICE,
    downstream: DOWNSTREAM,
    knownCases: KNOWN_CASES,
    occurrenceTimeWindow: {
      beforeMinutes: 10,
      afterMinutes: 5,
    },
  });
}
