import { AUTH_SERVER_ALARM } from './alarmDefinition.js';
import { unknownCaseFallback, UNKNOWN_CASE_TITLE } from '../../../actions/unknownCaseFallback.js';
import type { Runbook } from '../framework.js';
import { interop } from '../framework.js';

import { KNOWN_CASES } from './knownCases.js';

export function buildRunbook(): Runbook {
  return interop.apigw.createInteropApiGwAlarmRunbook({
    id: AUTH_SERVER_ALARM.runbookKey,
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
    resolveAlarmContext: AUTH_SERVER_ALARM.resolveContext,
    queryProfile: interop.apigw.INTEROP_API_GW_4XX_SERVICE_WARNINGS_PROFILE,
    apiGw: {
      logGroupTemplate: AUTH_SERVER_ALARM.apiGwLogGroupTemplate,
      profileId: AUTH_SERVER_ALARM.apiGwProfileId,
    },
    application: {
      serviceName: AUTH_SERVER_ALARM.serviceName,
      logGroupTemplate: AUTH_SERVER_ALARM.applicationLogGroupTemplate,
      varPrefix: AUTH_SERVER_ALARM.varPrefix,
      ...(AUTH_SERVER_ALARM.podAppFilter !== undefined ? { podAppFilter: AUTH_SERVER_ALARM.podAppFilter } : {}),
      // The warning scan stops at the alarm instant: later warnings belong
      // to a different occurrence.
      timeRangeFromParams: { start: 'startTime', end: 'alarmDatetime' },
      countField: 'count',
      label: `warning applicativi ${AUTH_SERVER_ALARM.serviceName}`,
    },
    knownCases: KNOWN_CASES,
    fallbackAction: unknownCaseFallback(UNKNOWN_CASE_TITLE, [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['API Gateway ID', '{{vars.interopApiGwId}}'],
      ['Errori 4xx API Gateway', '{{vars.apiGwErrorCount}}'],
      ['Warning auth-server', '{{vars.interopAuthServerLogCount}}'],
      ['CID estratti', '{{vars.interopAuthServerCidCount}}'],
      ['Log CID tracker', '{{vars.interopCidTrackerLogCount}}'],
    ]),
  });
}
