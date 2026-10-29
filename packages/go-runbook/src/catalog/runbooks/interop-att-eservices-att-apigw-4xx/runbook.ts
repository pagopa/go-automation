/**
 * Runbook: interop-att-eservices-att-apigw-4xx
 */

import { unknownCaseFallback, UNKNOWN_CASE_TITLE } from '../../../actions/unknownCaseFallback.js';
import { RunbookBuilder } from '../../../builders/RunbookBuilder.js';
import { CloudWatchLogsQueryStep } from '../../../steps/data/CloudWatchLogsQueryStep.js';
import type { Runbook } from '../../../types/Runbook.js';
import {
  ACCESS_LOG_QUERY,
  ALARM_NAME,
  API_GW_LOG_GROUP,
  API_GW_RESOURCE_NAME,
  QUERY_STEP_ID,
} from './alarmDefinition.js';
import { AnalyzeAttEservicesAccessStep } from './AnalyzeAttEservicesAccessStep.js';
import { KNOWN_CASES } from './knownCases.js';

/**
 * Builds the interop-att-eservices-att-apigw-4xx runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  const builder = RunbookBuilder.create(ALARM_NAME)
    .metadata({
      name: 'interop-att-eservices-att-apigw-4xx',
      description:
        'Analizza i 4xx dell’API Gateway e-services in Attestazione e riconosce le richieste 403 ai percorsi sospetti documentati.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'api-gateway', '4xx', 'eservices', 'attestation'],
    })
    .cloudExecutionPolicy({ sideEffects: 'NONE' })
    .occurrenceTimeWindow({ beforeMinutes: 5, afterMinutes: 1 })
    .step(
      new CloudWatchLogsQueryStep({
        id: QUERY_STEP_ID,
        label: 'Query access log 4xx e-services in Attestazione',
        logGroups: [API_GW_LOG_GROUP],
        query: ACCESS_LOG_QUERY,
        timeRangeFromParams: { start: 'startTime', end: 'endTime' },
        logGroupResolutionMode: 'search-configured-profiles',
        paginateResults: true,
        traceMetadata: { queryProfileId: 'interop-att-eservices-4xx', queryKind: 'access-log', identifierMode: 'none' },
      }),
      {
        evidence: [
          {
            id: 'att-eservices-access-requests',
            label: 'Richieste 4xx API Gateway e-services',
            type: 'step-output',
            retention: { mode: 'latest', limit: 5, timestampField: '@timestamp' },
          },
        ],
      },
    )
    .step(new AnalyzeAttEservicesAccessStep())
    .runbookContext({
      kind: 'apigw',
      services: [],
      apiGwLogGroup: API_GW_LOG_GROUP,
      queryProfileId: 'interop-att-eservices-4xx',
    })
    .analysisDefaults({
      runbookName: ALARM_NAME,
      resources: [{ name: API_GW_RESOURCE_NAME }],
      finalActions: [],
      links: [
        {
          url: 'https://pagopa.atlassian.net/wiki/spaces/GO/pages/2843770902/interop-att-eservices-att-apigw-4xx',
          name: ALARM_NAME,
          type: 'CONFLUENCE',
        },
      ],
    })
    .fallback(
      unknownCaseFallback(UNKNOWN_CASE_TITLE, [
        ['Ambiente', '{{vars.interopEnvironment}}'],
        ['Richieste 4xx', '{{vars.attEservicesRequestCount}}'],
        ['Richieste 403 documentate', '{{vars.attEservicesProbeCount}}'],
        ['Path osservati', '{{vars.attEservicesPaths}}'],
      ]),
    );
  for (const candidate of KNOWN_CASES) builder.knownCase(candidate);
  return builder.build();
}
