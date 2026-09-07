/**
 * Runbook: pn-external-registries-OneTrust-downstream-detection-Alarm
 */

import { service } from '../framework.js';
import type { Runbook } from '../framework.js';

import { KNOWN_CASES } from './knownCases.js';
import { SERVICE } from './knownServices.js';

/** Builds the pn-external-registries OneTrust downstream-detection runbook. */
export function buildRunbook(): Runbook {
  return service.createServiceAlarmRunbook({
    id: 'pn-external-registries-OneTrust-downstream-detection-Alarm',
    metadata: {
      name: 'pn-external-registries-OneTrust-downstream-detection-Alarm',
      description:
        'Gestire in modo standardizzato gli allarmi generati dagli errori del downstream One-Trust sul microservizio pn-external-registries.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['service', 'pn-external-registries', 'downstream', 'OneTrust'],
    },
    service: SERVICE,
    knownCases: KNOWN_CASES,
    occurrenceTimeWindow: {
      beforeMinutes: 10,
      afterMinutes: 5,
    },
  });
}
