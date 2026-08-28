import { unknownCaseFallback } from '../../../actions/unknownCaseFallback.js';
import { RunbookBuilder } from '../../../builders/RunbookBuilder.js';
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
import {
  ANALYZE_INTEROP_API_GW_5XX_STEP_ID,
  ANALYZE_INTEROP_APPLICATION_LOGS_STEP_ID,
  ANALYZE_INTEROP_CID_TRACKER_STEP_ID,
  QUERY_INTEROP_API_GW_5XX_STEP_ID,
  QUERY_INTEROP_APPLICATION_LOGS_STEP_ID,
  QUERY_INTEROP_CID_TRACKER_STEP_ID,
  RESOLVE_INTEROP_SELFCARE_API_GW_CONTEXT_STEP_ID,
} from './runbookSteps.js';

const TIME_RANGE_FROM_PARAMS = { start: 'startTime', end: 'endTime' } as const;

export function buildInteropSelfcareApiGw5xxRunbook(): Runbook {
  const builder = RunbookBuilder.create(INTEROP_SELFCARE_API_GW_RUNBOOK_KEY)
    .metadata({
      name: INTEROP_SELFCARE_API_GW_RUNBOOK_KEY,
      description:
        'Analizza gli allarmi 5xx dell’API Gateway Selfcare INTEROP, i log del backend-for-frontend e i log correlati tramite CID.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'api-gateway', '5xx', 'selfcare', 'backend-for-frontend'],
    })
    .occurrenceTimeWindow({ beforeMinutes: 5, afterMinutes: 1 })
    .cloudExecutionPolicy({ sideEffects: 'NONE' })
    .runbookContext({
      kind: 'apigw',
      apiGwLogGroup: INTEROP_SELFCARE_API_GW_LOG_GROUP_TEMPLATE,
      queryProfileId: INTEROP_SELFCARE_API_GW_PROFILE_ID,
      services: [
        {
          name: INTEROP_SELFCARE_API_GW_SERVICE_NAME,
          logGroup: INTEROP_SELFCARE_APPLICATION_LOG_GROUP_TEMPLATE,
          varPrefix: INTEROP_SELFCARE_API_GW_VAR_PREFIX,
        },
      ],
    })
    .analysisDefaults({
      runbookName: INTEROP_SELFCARE_API_GW_RUNBOOK_KEY,
      resources: [{ name: INTEROP_SELFCARE_API_GW_SERVICE_NAME, role: 'PRIMARY' }],
    });

  builder.step(
    new interop.apigw.ResolveInteropApiGwAlarmContextStep({
      id: RESOLVE_INTEROP_SELFCARE_API_GW_CONTEXT_STEP_ID,
      label: 'Risoluzione contesto API Gateway Selfcare INTEROP',
      resolverId: 'interop-selfcare-api-gateway-context',
      resolveAlarmContext: resolveInteropSelfcareApiGwAlarmContext,
    }),
  );

  builder.step(
    new interop.apigw.QueryInteropApiGwAggregatesStep({
      id: QUERY_INTEROP_API_GW_5XX_STEP_ID,
      label: 'Query aggregata access log 5xx API Gateway INTEROP',
      timeRangeFromParams: TIME_RANGE_FROM_PARAMS,
      queryProfileId: INTEROP_API_GW_5XX_QUERY_PROFILE_ID,
      queryKind: 'interop-api-gateway-5xx-aggregate',
      errorFamilyLabel: '5xx',
      buildQuery: buildInteropApiGw5xxAggregateQuery,
    }),
  );

  builder.step(
    new interop.apigw.AnalyzeInteropApiGwAggregatesStep({
      id: ANALYZE_INTEROP_API_GW_5XX_STEP_ID,
      label: 'Analisi aggregati 5xx API Gateway INTEROP',
      fromStep: QUERY_INTEROP_API_GW_5XX_STEP_ID,
      errorFamilyLabel: '5xx',
    }),
  );

  builder.step(
    new interop.k8s.QueryInteropK8sApplicationLogsStep({
      id: QUERY_INTEROP_APPLICATION_LOGS_STEP_ID,
      label: `Query log applicativi ${INTEROP_SELFCARE_API_GW_SERVICE_NAME}`,
      timeRangeFromParams: TIME_RANGE_FROM_PARAMS,
      queryProfileId: INTEROP_BFF_5XX_QUERY_PROFILE_ID,
      buildQuery: buildInteropBff5xxApplicationLogsQuery,
    }),
  );

  builder.step(
    new interop.k8s.AnalyzeInteropK8sApplicationLogsStep({
      id: ANALYZE_INTEROP_APPLICATION_LOGS_STEP_ID,
      label: `Analisi log applicativi ${INTEROP_SELFCARE_API_GW_SERVICE_NAME}`,
      fromStep: QUERY_INTEROP_APPLICATION_LOGS_STEP_ID,
      varPrefix: INTEROP_SELFCARE_API_GW_VAR_PREFIX,
    }),
  );

  builder.step(
    new interop.k8s.QueryInteropK8sCidTrackerStep({
      id: QUERY_INTEROP_CID_TRACKER_STEP_ID,
      label: 'Query CID tracker INTEROP',
      fromStep: ANALYZE_INTEROP_APPLICATION_LOGS_STEP_ID,
      timeRangeFromParams: TIME_RANGE_FROM_PARAMS,
    }),
  );

  builder.step(
    new interop.k8s.AnalyzeInteropK8sCidTrackerStep({
      id: ANALYZE_INTEROP_CID_TRACKER_STEP_ID,
      label: 'Analisi CID tracker INTEROP',
      fromStep: QUERY_INTEROP_CID_TRACKER_STEP_ID,
    }),
  );

  for (const knownCase of KNOWN_CASES) builder.knownCase(knownCase);

  builder.fallback(
    unknownCaseFallback('Nessun caso noto del runbook API Gateway Selfcare INTEROP ha matchato le evidenze.', [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['API Gateway ID', '{{vars.interopApiGwId}}'],
      ['Errori 5xx API Gateway', '{{vars.apiGwErrorCount}}'],
      ['Log applicativi BFF', '{{vars.interopBffLogCount}}'],
      ['CID estratti', '{{vars.interopBffCidCount}}'],
      ['Log CID tracker', '{{vars.interopCidTrackerLogCount}}'],
    ]),
  );

  return builder.build();
}
