/**
 * Runbook: pn-address-book-io-IO-ApiGwAlarm
 */

import { apigw } from '@go-automation/go-runbook';
import type { Runbook } from '@go-automation/go-runbook';

import { API_GW_LOG_GROUP, ENTRY_SERVICE, REACHABLE_SERVICES } from './knownServices.js';
import { KNOWN_URLS } from './knownUrls.js';
import { KNOWN_CASES } from './knownCases.js';

/**
 * Builds the pn-address-book-io-IO-ApiGwAlarm runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildAddressBookIoApiGwAlarmRunbook(): Runbook {
  return apigw.createApiGwAlarmRunbook({
    id: 'pn-address-book-io-IO-ApiGwAlarm',
    metadata: {
      name: 'ANALISI ALLARME pn-address-book-io-IO-ApiGwAlarm',
      description: 'Analizza gli allarmi API Gateway del microservizio pn-user-attributes',
      version: '3.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['api-gateway', 'pn-user-attributes', 'pn-data-vault', 'pn-external-registries', 'pn-ioAuthorizerLambda'],
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
