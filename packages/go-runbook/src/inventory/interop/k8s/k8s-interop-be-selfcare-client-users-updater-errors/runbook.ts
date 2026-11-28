import { SELFCARE_USERS_UPDATER_ALARM } from './alarmDefinition.js';
import { interop } from '../../../../toolkits/interop/index.js';
import type { Runbook } from '../../../../engine/index.js';

import { KNOWN_ERRORS } from './knownErrors.js';
import { SELFCARE_USERS_UPDATER_QUERY_PROFILE } from './queryProfile.js';

const CONFLUENCE_RUNBOOK_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/2129330177/k8s-interop-be-selfcare-client-users-updater-errors';

/**
 * Builds the k8s-interop-be-selfcare-client-users-updater-errors runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    alarm: SELFCARE_USERS_UPDATER_ALARM,
    metadata: {
      name: SELFCARE_USERS_UPDATER_ALARM.runbookKey,
      description:
        'Analizza gli allarmi k8s INTEROP del selfcare client users updater leggendo i log applicativi, estraendo i CID e consultando il CID tracker.',
      version: '1.0.1',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'selfcare', 'kafka'],
    },
    queryProfile: SELFCARE_USERS_UPDATER_QUERY_PROFILE,
    knownErrors: KNOWN_ERRORS,
    occurrenceTimeWindow: { beforeMinutes: 5, afterMinutes: 1 },
    analysisDefaults: {
      runbookName: SELFCARE_USERS_UPDATER_ALARM.runbookKey,
      links: [
        {
          url: CONFLUENCE_RUNBOOK_URL,
          name: SELFCARE_USERS_UPDATER_ALARM.runbookKey,
          type: 'CONFLUENCE',
        },
      ],
    },
  });
}
