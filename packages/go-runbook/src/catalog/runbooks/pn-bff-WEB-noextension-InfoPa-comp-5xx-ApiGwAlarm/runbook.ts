import { apigw } from '../framework.js';
import type { Runbook } from '../framework.js';
import { KNOWN_CASES } from './knownCases.js';
import { API_GW_LOG_GROUP, ENTRY_SERVICE, REACHABLE_SERVICES } from './knownServices.js';
import { KNOWN_URLS } from './knownUrls.js';
import { INFO_PA_QUERY_PROFILE } from './queryProfile.js';
import { SetVarStep } from '../../../steps/control/SetVarStep.js';

export const INFO_PA_ALARM = 'pn-bff-WEB-noextension-InfoPa-comp-5xx-ApiGwAlarm';
export const RUNBOOK_URL: string = `https://pagopa.atlassian.net/wiki/spaces/GO/pages/2913599691/${INFO_PA_ALARM}`;

export function buildRunbook(): Runbook {
  return apigw.createApiGwAlarmRunbook({
    id: INFO_PA_ALARM,
    metadata: {
      name: INFO_PA_ALARM,
      description: 'Analizza gli errori 5xx delle API WEB InfoPa e le chiamate correlate a pn-external-registries.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['api-gateway', 'pn-bff', 'info-pa', 'pn-external-registries', 'selfcare'],
    },
    apiGwLogGroup: API_GW_LOG_GROUP,
    entryService: ENTRY_SERVICE,
    services: REACHABLE_SERVICES,
    knownUrls: KNOWN_URLS,
    queryProfile: INFO_PA_QUERY_PROFILE,
    paginateAccessLogResults: true,
    authorizerFailureCheck: { defaultAuthorizer: apigw.API_GW_AUTHORIZER_LAMBDAS['pn-jwtAuthorizerLambda'] },
    executionLogAnalysisMode: 'best-effort',
    // The BFF and downstream generate different FALLBACK-UUIDs for the same
    // X-Ray root. Keep the BFF UUID as evidence and traverse using the root.
    hooks: [
      {
        at: 'after-entry-analysis',
        step: new SetVarStep({
          id: 'preserve-bff-fallback',
          label: 'Conserva il fallback UUID del BFF',
          varName: 'bffFallbackUuid',
          expression: '{{vars.fallbackUuid}}',
        }),
        silent: true,
      },
      {
        at: 'after-entry-analysis',
        step: new SetVarStep({
          id: 'use-xray-root-for-downstream',
          label: 'Correla pn-external-registries tramite X-Ray root',
          varName: 'fallbackUuid',
          value: '',
        }),
        silent: true,
      },
    ],
    knownCases: KNOWN_CASES,
    analysisDefaults: {
      runbookName: INFO_PA_ALARM,
      finalActions: [
        "Ho dubbi sulla criticità dell'allarme, riporto nel canale ufficiale il link all'analisi e chiedo un feedback al team Architettura",
      ],
      links: [{ url: RUNBOOK_URL, name: INFO_PA_ALARM, type: 'CONFLUENCE' }],
    },
  });
}
