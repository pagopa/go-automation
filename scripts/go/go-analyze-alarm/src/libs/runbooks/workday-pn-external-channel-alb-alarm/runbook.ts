/**
 * Runbook: workday-pn-external-channel-alb-alarm
 */

import { service } from '@go-automation/go-runbook';
import type { Runbook } from '@go-automation/go-runbook';

import { SERVICE } from './knownServices.js';
import { KNOWN_CASES } from './knownCases.js';

/**
 * Builds the workday-pn-external-channel-alb-alarm runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildWorkdayPnExternalChannelAlbAlarmRunbook(): Runbook {
  return service.createServiceAlarmRunbook({
    id: 'workday-pn-external-channel-alb-alarm',
    metadata: {
      name: 'ANALISI ALLARME workday-pn-external-channel-alb-alarm',
      description:
        'Gestire in modo standardizzato gli allarmi generati sul servizio pn-external-channel tramite analisi dei log applicativi.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['service', 'pn-external-channel', 'workday'],
    },
    service: SERVICE,
    knownCases: KNOWN_CASES,
  });
}
