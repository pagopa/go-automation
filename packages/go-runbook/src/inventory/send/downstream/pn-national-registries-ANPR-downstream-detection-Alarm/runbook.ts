/**
 * Runbook: pn-national-registries-ANPR-downstream-detection-Alarm
 */

import { downstream } from '../../../../toolkits/send/index.js';
import type { Runbook } from '../../../../engine/index.js';

import { KNOWN_ERRORS } from './knownErrors.js';
import { DOWNSTREAM, SERVICE } from './knownServices.js';

/** Builds the pn-national-registries ANPR downstream-detection runbook. */
export function buildRunbook(): Runbook {
  return downstream.createDownstreamAlarmRunbook({
    id: 'pn-national-registries-ANPR-downstream-detection-Alarm',
    metadata: {
      name: 'pn-national-registries-ANPR-downstream-detection-Alarm',
      description:
        'Gestire in modo standardizzato gli allarmi generati dagli errori del downstream ANPR sul microservizio pn-national-registries.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['service', 'pn-national-registries', 'downstream', 'ANPR'],
    },
    service: SERVICE,
    downstream: DOWNSTREAM,
    knownErrors: KNOWN_ERRORS,
    occurrenceTimeWindow: {
      beforeMinutes: 10,
      afterMinutes: 5,
    },
  });
}
