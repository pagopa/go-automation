import { CATALOG_READMODEL_WRITER_SQL_ALARM } from './alarmDefinition.js';
import { interop } from '../../../../toolkits/interop/index.js';
import type { Runbook } from '../../../../engine/index.js';

import { KNOWN_ERRORS } from './knownErrors.js';
import { CATALOG_READMODEL_WRITER_SQL_QUERY_PROFILE } from './queryProfile.js';

const CONFLUENCE_RUNBOOK_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3298033829/k8s-interop-be-catalog-readmodel-writer-sql-errors';

/**
 * Builds the k8s-interop-be-catalog-readmodel-writer-sql-errors runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    alarm: CATALOG_READMODEL_WRITER_SQL_ALARM,
    metadata: {
      name: CATALOG_READMODEL_WRITER_SQL_ALARM.runbookKey,
      description:
        'Analizza gli allarmi k8s INTEROP del catalog readmodel writer SQL leggendo i log applicativi, ' +
        'estraendo i CID e consultando il CID tracker.',
      version: '1.0.2',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'catalog', 'readmodel', 'sql', 'kafka'],
    },
    occurrenceTimeWindow: { beforeMinutes: 5, afterMinutes: 1 },
    queryProfile: CATALOG_READMODEL_WRITER_SQL_QUERY_PROFILE,
    knownErrors: KNOWN_ERRORS,
    analysisDefaults: {
      runbookName: CATALOG_READMODEL_WRITER_SQL_ALARM.runbookKey,
      links: [
        {
          url: CONFLUENCE_RUNBOOK_URL,
          name: CATALOG_READMODEL_WRITER_SQL_ALARM.runbookKey,
          type: 'CONFLUENCE',
        },
      ],
    },
  });
}
