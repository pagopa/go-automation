/**
 * Runbook: pn-bff-WEB-noextension-Addresses-comp-5xx-ApiGwAlarm
 */

import { apigw } from '../framework.js';
import type { Runbook } from '../framework.js';

import { API_GW_LOG_GROUP, ENTRY_SERVICE, REACHABLE_SERVICES } from './knownServices.js';
import { KNOWN_URLS } from './knownUrls.js';
import { KNOWN_CASES } from './knownCases.js';
import { ADDRESSES_QUERY_PROFILE } from './queryProfile.js';

/**
 * Builds the pn-bff-WEB-noextension-Addresses-comp-5xx-ApiGwAlarm runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return apigw.createApiGwAlarmRunbook({
    id: 'pn-bff-WEB-noextension-Addresses-comp-5xx-ApiGwAlarm',
    metadata: {
      name: 'pn-bff-WEB-noextension-Addresses-comp-5xx-ApiGwAlarm',
      description: 'Analizza gli errori delle API WEB Addresses e il timeout del BFF verso pn-user-attributes.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['api-gateway', 'pn-bff', 'addresses', 'pn-user-attributes'],
    },
    apiGwLogGroup: API_GW_LOG_GROUP,
    entryService: ENTRY_SERVICE,
    services: REACHABLE_SERVICES,
    knownUrls: KNOWN_URLS,
    queryProfile: ADDRESSES_QUERY_PROFILE,
    paginateAccessLogResults: true,
    fallbackMinStatusCode: 400,
    executionLogAnalysisMode: 'best-effort',
    authorizerFailureCheck: {
      defaultAuthorizer: apigw.API_GW_AUTHORIZER_LAMBDAS['pn-jwtAuthorizerLambda'],
    },
    knownCases: KNOWN_CASES,
    analysisDefaults: {
      finalActions: [],
      links: [
        {
          url: 'https://pagopa.atlassian.net/wiki/spaces/GO/pages/2865397761/pn-bff-WEB-noextension-Addresses-comp-5xx-ApiGwAlarm',
          name: 'Runbook API WEB Addresses',
          type: 'CONFLUENCE',
        },
      ],
    },
  });
}
