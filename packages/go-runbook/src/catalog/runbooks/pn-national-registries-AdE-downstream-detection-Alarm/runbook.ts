/**
 * Runbook: pn-national-registries-AdE-downstream-detection-Alarm
 */

import { service } from '../framework.js';
import type { Runbook } from '../framework.js';

import { KNOWN_CASES } from './knownCases.js';
import { SERVICE } from './knownServices.js';

/** Builds the pn-national-registries AdE downstream-detection runbook. */
export function buildNationalRegistriesAdeDownstreamDetectionAlarmRunbook(): Runbook {
  return service.createServiceAlarmRunbook({
    id: 'pn-national-registries-AdE-downstream-detection-Alarm',
    metadata: {
      name: 'pn-national-registries-AdE-downstream-detection-Alarm',
      description:
        'Gestire in modo standardizzato gli allarmi generati dagli errori del downstream AdE sul microservizio pn-national-registries.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['service', 'pn-national-registries', 'downstream', 'AdE'],
    },
    service: SERVICE,
    knownCases: KNOWN_CASES,
    occurrenceTimeWindow: {
      // The alarm evaluates 6 periods of 5 minutes; the triggering errors can
      // therefore precede the alarm occurrence by up to 30 minutes.
      beforeMinutes: 30,
      afterMinutes: 5,
    },
  });
}
