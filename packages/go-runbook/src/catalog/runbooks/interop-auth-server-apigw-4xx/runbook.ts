import { unknownCaseFallback } from '../../../actions/unknownCaseFallback.js';
import type { Runbook } from '../framework.js';
import { interop } from '../framework.js';

import { KNOWN_CASES } from './knownCases.js';
import {
  INTEROP_AUTH_SERVER_API_GW_LOG_GROUP_TEMPLATE,
  INTEROP_AUTH_SERVER_API_GW_PROFILE_ID,
  INTEROP_AUTH_SERVER_API_GW_RUNBOOK_KEY,
  INTEROP_AUTH_SERVER_APPLICATION_LOG_GROUP_TEMPLATE,
  INTEROP_AUTH_SERVER_POD_APP_FILTER,
  INTEROP_AUTH_SERVER_SERVICE_NAME,
  INTEROP_AUTH_SERVER_VAR_PREFIX,
  resolveInteropAuthServerApiGwAlarmContext,
} from './resolveInteropAlarmContext.js';

export function buildInteropAuthServerApiGw4xxRunbook(): Runbook {
  return interop.apigw.createInteropApiGwAlarmRunbook({
    id: INTEROP_AUTH_SERVER_API_GW_RUNBOOK_KEY,
    metadata: {
      name: INTEROP_AUTH_SERVER_API_GW_RUNBOOK_KEY,
      description:
        'Analizza gli allarmi 4xx dell’API Gateway authorization-server INTEROP, i warning applicativi e i log correlati tramite CID.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'api-gateway', '4xx', 'authorization', 'auth-server'],
    },
    occurrenceTimeWindow: { beforeMinutes: 2, afterMinutes: 1 },
    resolverId: 'interop-auth-server-api-gateway-context',
    resolveAlarmContext: resolveInteropAuthServerApiGwAlarmContext,
    queryProfile: interop.apigw.INTEROP_API_GW_4XX_SERVICE_WARNINGS_PROFILE,
    apiGw: {
      logGroupTemplate: INTEROP_AUTH_SERVER_API_GW_LOG_GROUP_TEMPLATE,
      profileId: INTEROP_AUTH_SERVER_API_GW_PROFILE_ID,
    },
    application: {
      serviceName: INTEROP_AUTH_SERVER_SERVICE_NAME,
      logGroupTemplate: INTEROP_AUTH_SERVER_APPLICATION_LOG_GROUP_TEMPLATE,
      varPrefix: INTEROP_AUTH_SERVER_VAR_PREFIX,
      podAppFilter: INTEROP_AUTH_SERVER_POD_APP_FILTER,
      // The warning scan stops at the alarm instant: later warnings belong
      // to a different occurrence.
      timeRangeFromParams: { start: 'startTime', end: 'alarmDatetime' },
      countField: 'count',
      label: `warning applicativi ${INTEROP_AUTH_SERVER_SERVICE_NAME}`,
    },
    knownCases: KNOWN_CASES,
    fallbackAction: unknownCaseFallback(
      'Nessun caso noto del runbook API Gateway auth-server INTEROP ha matchato le evidenze.',
      [
        ['Ambiente', '{{vars.interopEnvironment}}'],
        ['API Gateway ID', '{{vars.interopApiGwId}}'],
        ['Errori 4xx API Gateway', '{{vars.apiGwErrorCount}}'],
        ['Warning auth-server', '{{vars.interopAuthServerLogCount}}'],
        ['CID estratti', '{{vars.interopAuthServerCidCount}}'],
        ['Log CID tracker', '{{vars.interopCidTrackerLogCount}}'],
      ],
    ),
  });
}
