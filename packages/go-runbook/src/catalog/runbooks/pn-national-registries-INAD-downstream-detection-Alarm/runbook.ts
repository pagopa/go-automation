/**
 * Runbook: pn-national-registries-INAD-downstream-detection-Alarm
 */

import { service } from '../framework.js';
import type { Runbook } from '../framework.js';

import { KNOWN_CASES } from './knownCases.js';
import { SERVICE } from './knownServices.js';

/** Builds the pn-national-registries INAD downstream-detection runbook. */
export function buildNationalRegistriesInadDownstreamDetectionAlarmRunbook(): Runbook {
  return service.createServiceAlarmRunbook({
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
    knownCases: KNOWN_CASES,
    occurrenceTimeWindow: {
      beforeMinutes: 10,
      afterMinutes: 5,
    },
  });
}
