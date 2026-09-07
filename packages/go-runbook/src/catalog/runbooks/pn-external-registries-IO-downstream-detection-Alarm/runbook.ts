import { service } from '../framework.js';
import type { Runbook } from '../framework.js';

import { EXTERNAL_REGISTRIES_IO_ALARM } from './alarmDefinition.js';
import { KNOWN_CASES } from './knownCases.js';
import { SERVICE } from './knownServices.js';

const RUNBOOK_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3312976074/pn-external-registries-IO-downstream-detection-Alarm';

/** Builds the read-only IO downstream runbook documented by Confluence page 3312976074. */
export function buildRunbook(): Runbook {
  return service.createServiceAlarmRunbook({
    id: EXTERNAL_REGISTRIES_IO_ALARM,
    metadata: {
      name: EXTERNAL_REGISTRIES_IO_ALARM,
      description:
        'Analizza gli errori del downstream IO su pn-external-registries, correlando il trace_id ' +
        'e riconoscendo timeout di rete e risposte HTTP 500 con JSON incompleto.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['service', 'pn-external-registries', 'downstream', 'IO'],
    },
    service: SERVICE,
    knownCases: KNOWN_CASES,
    occurrenceTimeWindow: {
      // The source alarm evaluates 3 of 6 five-minute periods. Include the
      // full evaluation window, not just the latest ten minutes of errors.
      beforeMinutes: 30,
      afterMinutes: 5,
    },
    analysisDefaults: {
      runbookName: EXTERNAL_REGISTRIES_IO_ALARM,
      links: [{ url: RUNBOOK_URL, name: EXTERNAL_REGISTRIES_IO_ALARM, type: 'CONFLUENCE' }],
    },
  });
}
