import type { KnownError } from '../../../../engine/index.js';
import { createInteropApiGwKnownErrorFactory } from '../../../../toolkits/interop/index.js';

import { INTEROP_API_V3_5XX_ALARM as alarm } from './alarmDefinition.js';
const knownError = createInteropApiGwKnownErrorFactory({
  apiGatewayStepId: alarm.stepIds.queryApiGwAggregates,
  applicationLogsStepId: alarm.stepIds.queryApplicationLogs,
  cidTrackerStepId: alarm.stepIds.queryCidTracker,
  varPrefix: alarm.varPrefix,
  applicationLogsLabel: 'Log M2M gateway v3',
});
export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  knownError({
    code: 'INTEROP_APIGW_IAV3A5_API-V3-BAC-TIM-504',
    description: 'Timeout della chiamata API con risposta 504 dell’API Gateway',
    regex: 'Execution failed due to a timeout error',
    evidence: 'API_GATEWAY',
    environments: ['prod'],
    resolution:
      'Se le occorrenze sono singole o circoscritte a qualche minuto, non è necessario segnalarlo a prodotto; se la situazione perdura nel tempo, aprire un thread per la segnalazione.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: [],
    links: [],
  }),
  knownError({
    code: 'INTEROP_APIGW_IAV3A5_API-V3-MUL-BOU-NOT-FOU',
    description: 'Boundary multipart assente nella richiesta di caricamento dell’interfaccia di un descriptor',
    regex: 'Error in request: Multipart: Boundary not found',
    environments: ['test'],
    resolution: 'Risoluzione non documentata. Riferimento: PIN-10459.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: [],
    links: [
      { url: 'https://pagopa.atlassian.net/browse/PIN-10459', name: 'PIN-10459', type: 'JIRA' },
      {
        url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1782228399130199',
        name: 'Thread Slack 23/06/2026',
        type: 'SLACK',
      },
    ],
  }),
];
