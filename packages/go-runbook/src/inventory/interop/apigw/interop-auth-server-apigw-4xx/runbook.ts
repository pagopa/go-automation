import { AUTH_SERVER_ALARM } from './alarmDefinition.js';
import { interop, UNKNOWN_ERROR_TITLE, unknownErrorFallback } from '../../../../toolkits/interop/index.js';
import type { Runbook } from '../../../../engine/index.js';

import { KNOWN_ERRORS } from './knownErrors.js';
import { AUTH_SERVER_4XX_QUERY_PROFILE } from './queryProfile.js';

/**
 * Builds the interop-auth-server-apigw-4xx runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return interop.apigw.createInteropApiGwAlarmRunbook({
    alarm: AUTH_SERVER_ALARM,
    metadata: {
      name: AUTH_SERVER_ALARM.runbookKey,
      description:
        'Analizza gli allarmi 4xx dell’API Gateway authorization-server INTEROP, i warning applicativi e i log correlati tramite CID.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'api-gateway', '4xx', 'authorization', 'auth-server'],
    },
    occurrenceTimeWindow: { beforeMinutes: 2, afterMinutes: 1 },
    resolverId: 'interop-auth-server-api-gateway-context',
    queryProfile: AUTH_SERVER_4XX_QUERY_PROFILE,
    application: {
      // The warning scan stops at the alarm instant: later warnings belong
      // to a different occurrence.
      timeRangeFromParams: { start: 'startTime', end: 'alarmDatetime' },
      countField: 'count',
      label: `warning applicativi ${AUTH_SERVER_ALARM.serviceName}`,
    },
    knownErrors: KNOWN_ERRORS,
    analysisDefaults: {
      runbookName: AUTH_SERVER_ALARM.runbookKey,
      links: [
        {
          url: 'https://pagopa.atlassian.net/wiki/spaces/GO/pages/2125398072/interop-auth-server-prod-apigw-4xx',
          name: 'interop-auth-server-prod-apigw-4xx',
          type: 'CONFLUENCE',
        },
      ],
    },
    fallbackAction: unknownErrorFallback(UNKNOWN_ERROR_TITLE, [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['API Gateway ID', '{{vars.interopApiGwId}}'],
      ['Errori 4xx API Gateway', '{{vars.apiGwErrorCount}}'],
      ['Warning auth-server', '{{vars.interopAuthServerLogCount}}'],
      ['CID estratti', '{{vars.interopAuthServerCidCount}}'],
      ['Log CID tracker', '{{vars.interopCidTrackerLogCount}}'],
    ]),
  });
}
