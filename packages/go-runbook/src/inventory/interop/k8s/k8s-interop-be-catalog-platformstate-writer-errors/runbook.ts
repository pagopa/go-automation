import { CATALOG_PLATFORMSTATE_WRITER_ALARM } from './alarmDefinition.js';
import { interop } from '../../../../toolkits/interop/index.js';
import type { Runbook } from '../../../../engine/index.js';

import { KNOWN_ERRORS } from './knownErrors.js';
import { PLATFORMSTATE_WRITER_QUERY_PROFILE } from './queryProfile.js';
import { POD_CONTEXT } from './podContext.js';

const CONFLUENCE_RUNBOOK_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3298033847/k8s-interop-be-catalog-platformstate-writer-errors';

/**
 * Builds the k8s-interop-be-catalog-platformstate-writer-errors runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    alarm: CATALOG_PLATFORMSTATE_WRITER_ALARM,
    metadata: {
      name: CATALOG_PLATFORMSTATE_WRITER_ALARM.runbookKey,
      description:
        'Analizza gli allarmi k8s INTEROP del catalog platformstate writer leggendo i log applicativi, ' +
        'estraendo i CID e consultando il CID tracker.',
      version: '1.1.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'catalog', 'platformstate', 'kafka'],
    },
    queryProfile: PLATFORMSTATE_WRITER_QUERY_PROFILE,
    knownErrors: KNOWN_ERRORS,
    podContext: {
      step: POD_CONTEXT,
      evidenceId: 'platformstate-writer-context',
      evidenceLabel: 'Contesto di riavvio e rejoin del catalog platformstate writer',
    },
    analysisDefaults: {
      runbookName: CATALOG_PLATFORMSTATE_WRITER_ALARM.runbookKey,
      links: [
        {
          url: CONFLUENCE_RUNBOOK_URL,
          name: CATALOG_PLATFORMSTATE_WRITER_ALARM.runbookKey,
          type: 'CONFLUENCE',
        },
      ],
    },
  });
}
