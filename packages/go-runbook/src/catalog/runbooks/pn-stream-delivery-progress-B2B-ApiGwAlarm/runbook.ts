/**
 * Runbook: pn-stream-delivery-progress-B2B-ApiGwAlarm
 */

import { apigw } from '../framework.js';
import type { Runbook } from '../framework.js';

import { API_GW_LOG_GROUP, AUTHORIZER_LOG_GROUP, ENTRY_SERVICE, VERSIONING_LOG_GROUP } from './knownServices.js';
import { KNOWN_URLS } from './knownUrls.js';
import { KNOWN_CASES } from './knownCases.js';
import { QueryStreamLambdaLogsStep } from './QueryStreamLambdaLogsStep.js';

/**
 * Builds the pn-stream-delivery-progress-B2B-ApiGwAlarm runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return apigw.createApiGwAlarmRunbook({
    id: 'pn-stream-delivery-progress-B2B-ApiGwAlarm',
    metadata: {
      name: 'pn-stream-delivery-progress-B2B-ApiGwAlarm',
      description: 'Analizza gli errori API Gateway B2B di pn-stream delivery progress, versioning e authorizer.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['api-gateway', 'pn-stream', 'pn-versioningV1V2StreamLambda', 'pn-ApiKeyAuthorizerV2Lambda'],
    },
    apiGwLogGroup: API_GW_LOG_GROUP,
    minStatusCode: 500,
    fallbackMinStatusCode: 400,
    paginateAccessLogResults: true,
    entryService: ENTRY_SERVICE,
    knownUrls: KNOWN_URLS,
    executionLogAnalysisMode: 'best-effort',
    // Latency alone cannot distinguish a Lambda timeout from a failed invocation.
    hooks: [
      {
        at: 'before-service-traversal',
        step: new QueryStreamLambdaLogsStep({
          id: 'query-stream-authorizer-lambda',
          label: 'Log authorizer pn-ApiKeyAuthorizerV2Lambda',
          logGroup: AUTHORIZER_LOG_GROUP,
          requestIdField: 'authorizerRequestId',
        }),
        evidence: [
          {
            id: 'stream-authorizer',
            label: 'Authorizer correlato',
            type: 'log-sample',
            retention: { mode: 'latest', limit: 5, timestampField: '@timestamp' },
          },
        ],
      },
      {
        at: 'before-service-traversal',
        step: new QueryStreamLambdaLogsStep({
          id: 'query-stream-versioning-lambda',
          label: 'Log pn-versioningV1V2StreamLambda',
          logGroup: VERSIONING_LOG_GROUP,
          requestIdField: 'integrationRequestId',
        }),
        evidence: [
          {
            id: 'stream-versioning',
            label: 'Versioning correlato',
            type: 'log-sample',
            retention: { mode: 'latest', limit: 5, timestampField: '@timestamp' },
          },
        ],
      },
    ],
    knownCases: KNOWN_CASES,
  });
}
