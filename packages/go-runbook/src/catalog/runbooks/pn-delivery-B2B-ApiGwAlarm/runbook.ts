/**
 * Runbook: pn-delivery-B2B-ApiGwAlarm
 */

import { apigw } from '../framework.js';
import type { Runbook } from '../framework.js';

import { API_GW_LOG_GROUP, ENTRY_SERVICE, REACHABLE_SERVICES } from './knownServices.js';
import { KNOWN_URLS } from './knownUrls.js';
import { KNOWN_CASES } from './knownCases.js';

/**
 * Builds the pn-delivery-B2B-ApiGwAlarm runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildDeliveryB2BApiGwAlarmRunbook(): Runbook {
  return apigw.createApiGwAlarmRunbook({
    id: 'pn-delivery-B2B-ApiGwAlarm',
    metadata: {
      name: 'pn-delivery-B2B-ApiGwAlarm',
      description: 'Analizza gli errori 5xx della API pubblica B2B di pn-delivery e i servizi correlati.',
      version: '4.0.0',
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
    knownCases: KNOWN_CASES,
  });
}
