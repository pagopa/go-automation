import { lambda } from '../framework.js';
import type { Runbook } from '../framework.js';

import { DOWNSTREAM_ERROR_PATTERNS } from './knownErrors.js';
import { KNOWN_CASES } from './knownCases.js';
import { DOWNSTREAMS, LAMBDA_FUNCTION } from './knownServices.js';
import { SENDER_DASHBOARD_DATA_INDEXER_ALARM } from './alarmDefinition.js';

const CURRENT_RUNBOOK_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3294068753/pn-bff-SenderDashboardDataIndexer-LogInvocationErrors-Alarm';
const HISTORICAL_RUNBOOK_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/1487011901/SEND+Gestione+dell+errore+pn-bff-SenderDashboardDataIndexer-LogInvocationErrors-Alarm';
const IMPLEMENTATION_URL = 'https://github.com/pagopa/pn-bff/tree/develop/functions/senderDashboardDataIndexer';

export function buildRunbook(): Runbook {
  return lambda.createLambdaAlarmRunbook({
    id: SENDER_DASHBOARD_DATA_INDEXER_ALARM,
    metadata: {
      name: SENDER_DASHBOARD_DATA_INDEXER_ALARM,
      description:
        'Analizza gli errori della Lambda schedulata che genera l’indice dati della Dashboard Mittenti SEND.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['lambda', 'pn-bff', 'sender-dashboard', 'data-indexer', 'scheduled', 'datalake'],
    },
    lambda: LAMBDA_FUNCTION,
    downstreams: DOWNSTREAMS,
    downstreamErrorPatterns: DOWNSTREAM_ERROR_PATTERNS,
    knownCases: KNOWN_CASES,
    analysisDefaults: {
      runbookName: SENDER_DASHBOARD_DATA_INDEXER_ALARM,
      links: [
        {
          url: CURRENT_RUNBOOK_URL,
          name: SENDER_DASHBOARD_DATA_INDEXER_ALARM,
          type: 'CONFLUENCE',
        },
        {
          url: HISTORICAL_RUNBOOK_URL,
          name: 'Procedura operativa storica Dashboard Mittenti',
          type: 'CONFLUENCE',
        },
        {
          url: IMPLEMENTATION_URL,
          name: 'Implementazione pn-bff SenderDashboardDataIndexer',
          type: 'GITHUB',
        },
      ],
    },
  });
}
