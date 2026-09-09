/**
 * Runbook: pn-mandate-acceptance-failure-tech-Alarm
 */

import { service } from '../framework.js';
import type { Runbook } from '../framework.js';

import { MANDATE_ACCEPTANCE_FAILURE_TECH_ALARM } from './alarmDefinition.js';
import { KNOWN_CASES } from './knownCases.js';
import { SERVICE } from './knownServices.js';

const RUNBOOK_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3294593025/pn-mandate-acceptance-failure-tech-Alarm';

/** Builds the pn-mandate technical CIE acceptance-failure runbook. */
export function buildRunbook(): Runbook {
  return service.createServiceAlarmRunbook({
    id: MANDATE_ACCEPTANCE_FAILURE_TECH_ALARM,
    metadata: {
      name: MANDATE_ACCEPTANCE_FAILURE_TECH_ALARM,
      description:
        'Analizza gli errori tecnici durante l’accettazione delle deleghe CIE e riconosce il caso documentato dei dati NIS mancanti.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['service', 'pn-mandate', 'mandate-acceptance', 'CIE', 'TECH'],
    },
    service: SERVICE,
    knownCases: KNOWN_CASES,
    analysisDefaults: {
      runbookName: MANDATE_ACCEPTANCE_FAILURE_TECH_ALARM,
      links: [
        {
          url: RUNBOOK_URL,
          name: MANDATE_ACCEPTANCE_FAILURE_TECH_ALARM,
          type: 'CONFLUENCE',
        },
      ],
    },
  });
}
