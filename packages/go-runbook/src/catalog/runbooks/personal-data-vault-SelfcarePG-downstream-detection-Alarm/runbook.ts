/**
 * Runbook: personal-data-vault-SelfcarePG-downstream-detection-Alarm
 */

import { downstream } from '../framework.js';
import type { Runbook } from '../framework.js';

import { KNOWN_CASES } from './knownCases.js';
import { DOWNSTREAM, SERVICE } from './knownServices.js';

/** Builds the personal-data-vault SelfcarePG downstream-detection runbook. */
export function buildRunbook(): Runbook {
  return downstream.createDownstreamAlarmRunbook({
    id: 'personal-data-vault-SelfcarePG-downstream-detection-Alarm',
    metadata: {
      name: 'personal-data-vault-SelfcarePG-downstream-detection-Alarm',
      description:
        'Gestire in modo standardizzato gli allarmi generati dagli errori del downstream SelfcarePG sul microservizio pn-data-vault.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['service', 'pn-data-vault', 'downstream', 'SelfcarePG'],
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
