import { SELFCARE_ALARM } from './alarmDefinition.js';
import { unknownCaseFallback, UNKNOWN_CASE_TITLE } from '../../../actions/unknownCaseFallback.js';
import type { Runbook } from '../framework.js';
import { interop } from '../framework.js';

import { KNOWN_CASES } from './knownCases.js';

export function buildRunbook(): Runbook {
  return interop.apigw.createInteropApiGwAlarmRunbook({
    id: SELFCARE_ALARM.runbookKey,
    metadata: {
      name: SELFCARE_ALARM.runbookKey,
      description:
        'Analizza gli allarmi 5xx dell’API Gateway Selfcare INTEROP, i log del backend-for-frontend e i log correlati tramite CID.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'api-gateway', '5xx', 'selfcare', 'backend-for-frontend'],
    },
    occurrenceTimeWindow: { beforeMinutes: 5, afterMinutes: 1 },
    resolverId: 'interop-selfcare-api-gateway-context',
    resolveAlarmContext: SELFCARE_ALARM.resolveContext,
    queryProfile: interop.apigw.INTEROP_API_GW_5XX_SERVICE_ERRORS_PROFILE,
    apiGw: {
      logGroupTemplate: SELFCARE_ALARM.apiGwLogGroupTemplate,
      profileId: SELFCARE_ALARM.apiGwProfileId,
    },
    application: {
      serviceName: SELFCARE_ALARM.serviceName,
      logGroupTemplate: SELFCARE_ALARM.applicationLogGroupTemplate,
      varPrefix: SELFCARE_ALARM.varPrefix,
    },
    knownCases: KNOWN_CASES,
    fallbackAction: unknownCaseFallback(UNKNOWN_CASE_TITLE, [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['API Gateway ID', '{{vars.interopApiGwId}}'],
      ['Errori 5xx API Gateway', '{{vars.apiGwErrorCount}}'],
      ['Log applicativi BFF', '{{vars.interopBffLogCount}}'],
      ['CID estratti', '{{vars.interopBffCidCount}}'],
      ['Log CID tracker', '{{vars.interopCidTrackerLogCount}}'],
    ]),
  });
}
