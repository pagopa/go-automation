import { lambda } from '../framework.js';
import type { Runbook } from '../framework.js';

import { DOWNSTREAM_MONITORING_LAMBDA_ALARM } from './alarmDefinition.js';
import { DOWNSTREAM_ERROR_PATTERNS } from './knownErrors.js';
import { KNOWN_CASES } from './knownCases.js';
import { DOWNSTREAMS, LAMBDA_FUNCTION } from './knownServices.js';

const RUNBOOK_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3317137556/pn-downstream-monitoring-lambda-LogInvocationErrors-Alarm';
const INCIDENT_THREAD_URL = 'https://pagopaspa.slack.com/archives/C087KRMD16E/p1788881608482419';

export function buildRunbook(): Runbook {
  return lambda.createLambdaAlarmRunbook({
    id: DOWNSTREAM_MONITORING_LAMBDA_ALARM,
    metadata: {
      name: DOWNSTREAM_MONITORING_LAMBDA_ALARM,
      description:
        'Analizza gli errori di invocazione della Lambda SEND pn-downstream-monitoring-lambda negli account core e confinfo.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['lambda', 'downstream-monitoring', 'throttling', 's3', 'core', 'confinfo'],
    },
    lambda: LAMBDA_FUNCTION,
    downstreams: DOWNSTREAMS,
    downstreamErrorPatterns: DOWNSTREAM_ERROR_PATTERNS,
    knownCases: KNOWN_CASES,
    analysisDefaults: {
      runbookName: DOWNSTREAM_MONITORING_LAMBDA_ALARM,
      links: [
        {
          url: RUNBOOK_URL,
          name: DOWNSTREAM_MONITORING_LAMBDA_ALARM,
          type: 'CONFLUENCE',
        },
        {
          url: INCIDENT_THREAD_URL,
          name: 'Segnalazione SlowDown dell’8 settembre 2026',
          type: 'SLACK',
        },
      ],
    },
  });
}
