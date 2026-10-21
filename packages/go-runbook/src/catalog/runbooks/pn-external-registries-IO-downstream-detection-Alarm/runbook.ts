import { downstream } from '../framework.js';
import type { Runbook } from '../framework.js';
import { EXTERNAL_REGISTRIES_IO_ALARM } from './alarmDefinition.js';
import { KNOWN_CASES } from './knownCases.js';
import { DOWNSTREAM, SERVICE } from './knownServices.js';
const RUNBOOK_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3312976074/pn-external-registries-IO-downstream-detection-Alarm';
/** Builds the read-only IO downstream runbook documented by Confluence page 3312976074. */
export function buildRunbook(): Runbook {
  return downstream.createDownstreamAlarmRunbook({
    id: EXTERNAL_REGISTRIES_IO_ALARM,
    metadata: {
      name: EXTERNAL_REGISTRIES_IO_ALARM,
      description:
        'Analizza gli errori del downstream IO su pn-external-registries, correlando il trace_id ' +
        'e riconoscendo i casi documentati di timeout, errori di attivazione ed errori applicativi.',
      version: '1.0.1',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['service', 'pn-external-registries', 'downstream', 'IO'],
    },
    service: SERVICE,
    downstream: DOWNSTREAM,
    knownCases: KNOWN_CASES,
    occurrenceTimeWindow: {
      // Preserve the diagnostic window associated with the documented 3/6 periods.
      // This scan interval is not a fixed alarm recovery timer.
      beforeMinutes: 30,
      afterMinutes: 5,
    },
    analysisDefaults: {
      runbookName: EXTERNAL_REGISTRIES_IO_ALARM,
      finalActions: [],
      links: [{ url: RUNBOOK_URL, name: EXTERNAL_REGISTRIES_IO_ALARM, type: 'CONFLUENCE' }],
    },
  });
}
