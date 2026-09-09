import { CATALOG_READMODEL_WRITER_SQL_ALARM } from './alarmDefinition.js';
import { interop } from '../framework.js';
import type { Runbook } from '../framework.js';

import { KNOWN_CASES } from './knownCases.js';

const CONFLUENCE_RUNBOOK_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3298033829/k8s-interop-be-catalog-readmodel-writer-sql-errors';

export function buildRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    id: CATALOG_READMODEL_WRITER_SQL_ALARM.runbookKey,
    metadata: {
      name: CATALOG_READMODEL_WRITER_SQL_ALARM.runbookKey,
      description:
        'Analizza gli allarmi k8s INTEROP del catalog readmodel writer SQL leggendo i log applicativi, ' +
        'estraendo i CID e consultando il CID tracker.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'catalog', 'readmodel', 'sql', 'kafka'],
    },
    service: {
      name: CATALOG_READMODEL_WRITER_SQL_ALARM.podApp,
      logGroup: CATALOG_READMODEL_WRITER_SQL_ALARM.logGroup,
      varPrefix: CATALOG_READMODEL_WRITER_SQL_ALARM.varPrefix,
    },
    resolveAlarmContext: CATALOG_READMODEL_WRITER_SQL_ALARM.resolveContext,
    knownCases: KNOWN_CASES,
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
