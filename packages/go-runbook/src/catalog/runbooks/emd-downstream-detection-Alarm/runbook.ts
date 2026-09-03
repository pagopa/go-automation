/**
 * Runbook: emd-downstream-detection-Alarm
 */

import { service } from '../framework.js';
import type { Runbook } from '../framework.js';

import { KNOWN_CASES } from './knownCases.js';
import { SERVICE } from './knownServices.js';

/** Builds the EMD (Multicanalità) downstream-detection runbook. */
export function buildRunbook(): Runbook {
  return service.createServiceAlarmRunbook({
    id: 'emd-downstream-detection-Alarm',
    metadata: {
      name: 'emd-downstream-detection-Alarm',
      description:
        'Gestire in modo standardizzato gli allarmi generati dagli errori del downstream EMD (Multicanalità) sul microservizio pn-emd-integration.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['service', 'pn-emd-integration', 'downstream', 'EMD', 'Multicanalità'],
    },
    service: SERVICE,
    knownCases: KNOWN_CASES,
    occurrenceTimeWindow: {
      // The alarm evaluates six five-minute periods. A production occurrence
      // fired 21m42s after its latest matching downstream error.
      beforeMinutes: 30,
      afterMinutes: 5,
    },
  });
}
