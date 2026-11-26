import { service } from '../../../../toolkits/send/index.js';
import type { Runbook } from '../../../../engine/index.js';

import { EXTERNAL_CHANNEL_FATAL_ALARM } from './alarmDefinition.js';
import { KNOWN_CASES } from './knownCases.js';
import { SERVICE } from './knownServices.js';

const RUNBOOK_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3472163564/oncall-pn-external-channel-ErrorFatalLogs-Alarm';

/**
 * Builds the oncall-pn-external-channel-ErrorFatalLogs-Alarm runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return service.createSendServiceAlarmRunbook({
    id: EXTERNAL_CHANNEL_FATAL_ALARM,
    metadata: {
      name: EXTERNAL_CHANNEL_FATAL_ALARM,
      description: 'Analizza gli errori FATAL di pn-external-channel e riconosce i disservizi del provider PEC.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['service', 'pn-external-channel', 'pec', 'oncall'],
    },
    service: SERVICE,
    knownCases: KNOWN_CASES,
    occurrenceTimeWindow: { beforeMinutes: 5, afterMinutes: 5 },
    analysisDefaults: {
      runbookName: EXTERNAL_CHANNEL_FATAL_ALARM,
      links: [{ url: RUNBOOK_URL, name: EXTERNAL_CHANNEL_FATAL_ALARM, type: 'CONFLUENCE' }],
    },
  });
}
