import { unknownCaseFallback } from '../../../actions/unknownCaseFallback.js';
import type { Runbook } from '../framework.js';
import { interop } from '../framework.js';

import { KNOWN_CASES } from './knownCases.js';
import {
  buildInteropApiGw5xxAggregateQuery,
  buildInteropBff5xxApplicationLogsQuery,
  INTEROP_API_GW_5XX_QUERY_PROFILE_ID,
  INTEROP_BFF_5XX_QUERY_PROFILE_ID,
} from './queries.js';
import {
  INTEROP_SELFCARE_API_GW_LOG_GROUP_TEMPLATE,
  INTEROP_SELFCARE_API_GW_PROFILE_ID,
  INTEROP_SELFCARE_API_GW_RUNBOOK_KEY,
  INTEROP_SELFCARE_API_GW_SERVICE_NAME,
  INTEROP_SELFCARE_API_GW_VAR_PREFIX,
  INTEROP_SELFCARE_APPLICATION_LOG_GROUP_TEMPLATE,
  resolveInteropSelfcareApiGwAlarmContext,
} from './resolveInteropAlarmContext.js';

export function buildInteropSelfcareApiGw5xxRunbook(): Runbook {
  return interop.apigw.createInteropApiGwAlarmRunbook({
    id: INTEROP_SELFCARE_API_GW_RUNBOOK_KEY,
    metadata: {
      name: INTEROP_SELFCARE_API_GW_RUNBOOK_KEY,
      description:
        'Analizza gli allarmi 5xx dell’API Gateway Selfcare INTEROP, i log del backend-for-frontend e i log correlati tramite CID.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'api-gateway', '5xx', 'selfcare', 'backend-for-frontend'],
    },
    occurrenceTimeWindow: { beforeMinutes: 5, afterMinutes: 1 },
    resolverId: 'interop-selfcare-api-gateway-context',
    resolveAlarmContext: resolveInteropSelfcareApiGwAlarmContext,
    apiGw: {
      logGroupTemplate: INTEROP_SELFCARE_API_GW_LOG_GROUP_TEMPLATE,
      profileId: INTEROP_SELFCARE_API_GW_PROFILE_ID,
      queryProfileId: INTEROP_API_GW_5XX_QUERY_PROFILE_ID,
      queryKind: 'interop-api-gateway-5xx-aggregate',
      errorFamilyLabel: '5xx',
      buildQuery: buildInteropApiGw5xxAggregateQuery,
    },
    application: {
      serviceName: INTEROP_SELFCARE_API_GW_SERVICE_NAME,
      logGroupTemplate: INTEROP_SELFCARE_APPLICATION_LOG_GROUP_TEMPLATE,
      varPrefix: INTEROP_SELFCARE_API_GW_VAR_PREFIX,
      queryProfileId: INTEROP_BFF_5XX_QUERY_PROFILE_ID,
      buildQuery: buildInteropBff5xxApplicationLogsQuery,
    },
    knownCases: KNOWN_CASES,
    fallbackAction: unknownCaseFallback(
      'Nessun caso noto del runbook API Gateway Selfcare INTEROP ha matchato le evidenze.',
      [
        ['Ambiente', '{{vars.interopEnvironment}}'],
        ['API Gateway ID', '{{vars.interopApiGwId}}'],
        ['Errori 5xx API Gateway', '{{vars.apiGwErrorCount}}'],
        ['Log applicativi BFF', '{{vars.interopBffLogCount}}'],
        ['CID estratti', '{{vars.interopBffCidCount}}'],
        ['Log CID tracker', '{{vars.interopCidTrackerLogCount}}'],
      ],
    ),
  });
}
