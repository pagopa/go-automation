/**
 * Runbook: pn-delivery-B2B-ApiGwAlarm
 */

import { apigw } from '../framework.js';
import type { Runbook } from '../framework.js';

import { API_GW_LOG_GROUP, ENTRY_SERVICE, REACHABLE_SERVICES, VERSIONING_LAMBDA_LOG_GROUP } from './knownServices.js';
import { KNOWN_URLS } from './knownUrls.js';
import { KNOWN_CASES } from './knownCases.js';
import { QueryVersioningLambdaErrorsStep } from './QueryVersioningLambdaErrorsStep.js';
import { VERSIONING_LAMBDA_PROBE_STEP_ID } from './versioningLambdaProbe.js';

/**
 * Builds the pn-delivery-B2B-ApiGwAlarm runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return apigw.createApiGwAlarmRunbook({
    id: 'pn-delivery-B2B-ApiGwAlarm',
    metadata: {
      name: 'pn-delivery-B2B-ApiGwAlarm',
      description: 'Analizza gli errori 5xx della API pubblica B2B di pn-delivery e i servizi correlati.',
      version: '4.2.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: [
        'api-gateway',
        'pn-delivery',
        'pn-external-registries',
        'pn-data-vault',
        'pn-f24',
        'pn-safestorage',
        'pn-b2bAuthorizerLambda',
      ],
    },
    apiGwLogGroup: API_GW_LOG_GROUP,
    entryService: ENTRY_SERVICE,
    services: REACHABLE_SERVICES,
    knownUrls: KNOWN_URLS,
    authorizerFailureCheck: {
      defaultAuthorizer: apigw.API_GW_AUTHORIZER_LAMBDAS['pn-b2bAuthorizerLambda'],
    },
    executionLogAnalysisMode: 'best-effort',
    hooks: [
      {
        at: 'after-entry-analysis',
        step: new QueryVersioningLambdaErrorsStep({
          id: VERSIONING_LAMBDA_PROBE_STEP_ID,
          label: 'Verifica errori Lambda versioning',
          lambdaLogGroup: VERSIONING_LAMBDA_LOG_GROUP,
          timeRangeFromParams: { start: 'startTime', end: 'endTime' },
        }),
        silent: true,
      },
    ],
    knownCases: KNOWN_CASES,
  });
}
