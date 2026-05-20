/**
 * Runbook: pn-delivery-IO_EXP-ApiGwAlarm
 */

import { apigw } from '@go-automation/go-runbook';
import type { Runbook } from '@go-automation/go-runbook';

import { API_GW_LOG_GROUP, ENTRY_SERVICE, REACHABLE_SERVICES } from './knownServices.js';
import { KNOWN_URLS } from './knownUrls.js';
import { KNOWN_CASES } from './knownCases.js';

/**
 * Builds the pn-delivery-IO_EXP-ApiGwAlarm runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildDeliveryIoExpApiGwAlarmRunbook(): Runbook {
  return apigw.createApiGwAlarmRunbook({
    id: 'pn-delivery-IO_EXP-ApiGwAlarm',
    metadata: {
      name: 'ANALISI ALLARME pn-delivery-IO_EXP-ApiGwAlarm',
      description: '',
      version: '3.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: [],
    },
    apiGwLogGroup: API_GW_LOG_GROUP,
    entryService: ENTRY_SERVICE,
    services: REACHABLE_SERVICES,
    knownUrls: KNOWN_URLS,
    authorizerFailureCheck: {
      defaultAuthorizer: apigw.API_GW_AUTHORIZER_LAMBDAS['pn-ioAuthorizerLambda'],
    },
    knownCases: KNOWN_CASES,
  });
}
