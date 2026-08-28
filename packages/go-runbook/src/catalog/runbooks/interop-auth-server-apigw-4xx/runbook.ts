import { unknownCaseFallback } from '../../../actions/unknownCaseFallback.js';
import { RunbookBuilder } from '../../../builders/RunbookBuilder.js';
import { interop } from '../framework.js';
import type { Runbook } from '../framework.js';

import { KNOWN_CASES } from './knownCases.js';
import {
  buildInteropAuthServerApiGw4xxAggregateQuery,
  buildInteropAuthServerWarningsQuery,
  INTEROP_AUTH_SERVER_WARNINGS_QUERY_PROFILE_ID,
} from './queries.js';
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
import {
  ANALYZE_INTEROP_API_GW_4XX_STEP_ID,
  ANALYZE_INTEROP_AUTH_SERVER_CID_TRACKER_STEP_ID,
  ANALYZE_INTEROP_AUTH_SERVER_WARNINGS_STEP_ID,
  QUERY_INTEROP_API_GW_4XX_STEP_ID,
  QUERY_INTEROP_AUTH_SERVER_CID_TRACKER_STEP_ID,
  QUERY_INTEROP_AUTH_SERVER_WARNINGS_STEP_ID,
  RESOLVE_INTEROP_AUTH_SERVER_API_GW_CONTEXT_STEP_ID,
} from './runbookSteps.js';

const API_GW_TIME_RANGE = { start: 'startTime', end: 'endTime' } as const;
const APPLICATION_TIME_RANGE = { start: 'startTime', end: 'alarmDatetime' } as const;

export function buildInteropAuthServerApiGw4xxRunbook(): Runbook {
  const builder = RunbookBuilder.create(INTEROP_AUTH_SERVER_API_GW_RUNBOOK_KEY)
    .metadata({
      name: INTEROP_AUTH_SERVER_API_GW_RUNBOOK_KEY,
      description:
        'Analizza gli allarmi 4xx dell’API Gateway authorization-server INTEROP, i warning applicativi e i log correlati tramite CID.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'api-gateway', '4xx', 'authorization', 'auth-server'],
    })
    .occurrenceTimeWindow({ beforeMinutes: 2, afterMinutes: 1 })
    .cloudExecutionPolicy({ sideEffects: 'NONE' })
    .runbookContext({
      kind: 'apigw',
      apiGwLogGroup: INTEROP_AUTH_SERVER_API_GW_LOG_GROUP_TEMPLATE,
      queryProfileId: INTEROP_AUTH_SERVER_API_GW_PROFILE_ID,
      services: [
        {
          name: INTEROP_AUTH_SERVER_SERVICE_NAME,
          logGroup: INTEROP_AUTH_SERVER_APPLICATION_LOG_GROUP_TEMPLATE,
          varPrefix: INTEROP_AUTH_SERVER_VAR_PREFIX,
        },
      ],
    })
    .analysisDefaults({
      runbookName: INTEROP_AUTH_SERVER_API_GW_RUNBOOK_KEY,
      resources: [{ name: INTEROP_AUTH_SERVER_SERVICE_NAME, role: 'PRIMARY' }],
    });

  builder.step(
    new interop.apigw.ResolveInteropApiGwAlarmContextStep({
      id: RESOLVE_INTEROP_AUTH_SERVER_API_GW_CONTEXT_STEP_ID,
      label: 'Risoluzione contesto API Gateway auth-server INTEROP',
      resolverId: 'interop-auth-server-api-gateway-context',
      resolveAlarmContext: resolveInteropAuthServerApiGwAlarmContext,
    }),
  );

  builder.step(
    new interop.apigw.QueryInteropApiGwAggregatesStep({
      id: QUERY_INTEROP_API_GW_4XX_STEP_ID,
      label: 'Query aggregata access log 4xx API Gateway auth-server INTEROP',
      timeRangeFromParams: API_GW_TIME_RANGE,
      queryProfileId: INTEROP_AUTH_SERVER_API_GW_PROFILE_ID,
      queryKind: 'interop-api-gateway-auth-server-4xx-aggregate',
      errorFamilyLabel: '4xx',
      buildQuery: buildInteropAuthServerApiGw4xxAggregateQuery,
    }),
  );

  builder.step(
    new interop.apigw.AnalyzeInteropApiGwAggregatesStep({
      id: ANALYZE_INTEROP_API_GW_4XX_STEP_ID,
      label: 'Analisi aggregati 4xx API Gateway auth-server INTEROP',
      fromStep: QUERY_INTEROP_API_GW_4XX_STEP_ID,
      errorFamilyLabel: '4xx',
    }),
  );

  builder.step(
    new interop.k8s.QueryInteropK8sApplicationLogsStep({
      id: QUERY_INTEROP_AUTH_SERVER_WARNINGS_STEP_ID,
      label: `Query warning applicativi ${INTEROP_AUTH_SERVER_SERVICE_NAME}`,
      timeRangeFromParams: APPLICATION_TIME_RANGE,
      queryProfileId: INTEROP_AUTH_SERVER_WARNINGS_QUERY_PROFILE_ID,
      buildQuery: () => buildInteropAuthServerWarningsQuery(INTEROP_AUTH_SERVER_POD_APP_FILTER),
    }),
  );

  builder.step(
    new interop.k8s.AnalyzeInteropK8sApplicationLogsStep({
      id: ANALYZE_INTEROP_AUTH_SERVER_WARNINGS_STEP_ID,
      label: `Analisi warning applicativi ${INTEROP_AUTH_SERVER_SERVICE_NAME}`,
      fromStep: QUERY_INTEROP_AUTH_SERVER_WARNINGS_STEP_ID,
      varPrefix: INTEROP_AUTH_SERVER_VAR_PREFIX,
      countField: 'count',
    }),
  );

  builder.step(
    new interop.k8s.QueryInteropK8sCidTrackerStep({
      id: QUERY_INTEROP_AUTH_SERVER_CID_TRACKER_STEP_ID,
      label: 'Query CID tracker auth-server INTEROP',
      fromStep: ANALYZE_INTEROP_AUTH_SERVER_WARNINGS_STEP_ID,
      timeRangeFromParams: API_GW_TIME_RANGE,
    }),
  );

  builder.step(
    new interop.k8s.AnalyzeInteropK8sCidTrackerStep({
      id: ANALYZE_INTEROP_AUTH_SERVER_CID_TRACKER_STEP_ID,
      label: 'Analisi CID tracker auth-server INTEROP',
      fromStep: QUERY_INTEROP_AUTH_SERVER_CID_TRACKER_STEP_ID,
    }),
  );

  for (const knownCase of KNOWN_CASES) builder.knownCase(knownCase);

  builder.fallback(
    unknownCaseFallback('Nessun caso noto del runbook API Gateway auth-server INTEROP ha matchato le evidenze.', [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['API Gateway ID', '{{vars.interopApiGwId}}'],
      ['Errori 4xx API Gateway', '{{vars.apiGwErrorCount}}'],
      ['Warning auth-server', '{{vars.interopAuthServerLogCount}}'],
      ['CID estratti', '{{vars.interopAuthServerCidCount}}'],
      ['Log CID tracker', '{{vars.interopCidTrackerLogCount}}'],
    ]),
  );

  return builder.build();
}
