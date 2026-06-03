/**
 * Runbook: pn-delivery-push-B2B-ApiGwAlarm
 */

import { apigw } from '@go-automation/go-runbook';
import type { Runbook } from '@go-automation/go-runbook';

import { API_GW_LOG_GROUP, ENTRY_SERVICE, REACHABLE_SERVICES } from './knownServices.js';
import { KNOWN_URLS } from './knownUrls.js';
import { KNOWN_CASES } from './knownCases.js';

/**
 * Builds the pn-delivery-push-B2B-ApiGwAlarm runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildDeliveryPushB2BApiGwAlarmRunbook(): Runbook {
  return apigw.createApiGwAlarmRunbook({
    id: 'pn-delivery-push-B2B-ApiGwAlarm',
    metadata: {
      name: 'ANALISI ALLARME pn-delivery-push-B2B-ApiGwAlarm',
      description: 'Analizza gli allarmi API Gateway del microservizio pn-delivery-push per le API B2B.',
      version: '3.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['api-gateway', 'pn-delivery-push', 'pn-safestorage', 'pn-data-vault', 'pn-b2bAuthorizerLambda'],
    },
    apiGwLogGroup: API_GW_LOG_GROUP,
    minStatusCode: 400,
    entryService: ENTRY_SERVICE,
    services: REACHABLE_SERVICES,
    knownUrls: KNOWN_URLS,
    authorizerFailureCheck: {
      defaultAuthorizer: apigw.API_GW_AUTHORIZER_LAMBDAS['pn-b2bAuthorizerLambda'],
    },
    knownCases: KNOWN_CASES,
  });
}
