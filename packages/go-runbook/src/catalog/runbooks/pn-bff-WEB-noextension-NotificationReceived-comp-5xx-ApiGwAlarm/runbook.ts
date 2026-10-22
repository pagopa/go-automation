/**
 * Runbook: pn-bff-WEB-noextension-NotificationReceived-comp-5xx-ApiGwAlarm
 */

import { apigw } from '../framework.js';
import type { Runbook } from '../framework.js';

import { API_GW_LOG_GROUP, ENTRY_SERVICE, REACHABLE_SERVICES } from './knownServices.js';
import { KNOWN_URLS } from './knownUrls.js';
import { KNOWN_CASES } from './knownCases.js';
import { NOTIFICATION_RECEIVED_QUERY_PROFILE } from './queryProfile.js';
import { SetVarStep } from '../../../steps/control/SetVarStep.js';

/**
 * Builds the pn-bff-WEB-noextension-NotificationReceived-comp-5xx-ApiGwAlarm runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return apigw.createApiGwAlarmRunbook({
    id: 'pn-bff-WEB-noextension-NotificationReceived-comp-5xx-ApiGwAlarm',
    metadata: {
      name: 'pn-bff-WEB-noextension-NotificationReceived-comp-5xx-ApiGwAlarm',
      description:
        'Diagnosi degli errori 5xx delle API WEB NotificationReceived e delle chiamate a pn-delivery e pn-external-registries',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['api-gateway', 'pn-bff', 'notification-received'],
    },
    apiGwLogGroup: API_GW_LOG_GROUP,
    entryService: ENTRY_SERVICE,
    services: REACHABLE_SERVICES,
    queryProfile: NOTIFICATION_RECEIVED_QUERY_PROFILE,
    paginateAccessLogResults: true,
    executionLogAnalysisMode: 'best-effort',
    hooks: [
      {
        at: 'after-entry-analysis',
        silent: true,
        step: new SetVarStep({
          id: 'preserve-bff-fallback',
          label: 'Conserva il fallback BFF',
          varName: 'bffFallbackUuid',
          expression: '{{vars.fallbackUuid}}',
        }),
      },
      {
        at: 'after-entry-analysis',
        silent: true,
        step: new SetVarStep({
          id: 'use-xray-root-for-downstream',
          label: 'Correla i servizi tramite X-Ray root',
          varName: 'fallbackUuid',
          value: '',
        }),
      },
    ],
    knownUrls: KNOWN_URLS,
    authorizerFailureCheck: {
      defaultAuthorizer: apigw.API_GW_AUTHORIZER_LAMBDAS['pn-jwtAuthorizerLambda'],
    },
    knownCases: KNOWN_CASES,
    analysisDefaults: {
      runbookName: 'pn-bff-WEB-noextension-NotificationReceived-comp-5xx-ApiGwAlarm',
      links: [
        {
          url: 'https://pagopa.atlassian.net/wiki/spaces/GO/pages/2112749584/pn-bff-WEB-noextension-NotificationReceived-comp-5xx-ApiGwAlarm',
          name: 'NotificationReceived WEB 5xx',
          type: 'CONFLUENCE',
        },
      ],
    },
  });
}
