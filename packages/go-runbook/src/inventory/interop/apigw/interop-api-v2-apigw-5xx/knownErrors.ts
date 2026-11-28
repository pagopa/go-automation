import type { KnownError } from '../../../../engine/index.js';
import { createInteropApiGwKnownErrorFactory } from '../../../../toolkits/interop/index.js';

import { INTEROP_API_V2_5XX_ALARM as alarm } from './alarmDefinition.js';
const knownError = createInteropApiGwKnownErrorFactory({
  apiGatewayStepId: alarm.stepIds.queryApiGwAggregates,
  applicationLogsStepId: alarm.stepIds.queryApplicationLogs,
  cidTrackerStepId: alarm.stepIds.queryCidTracker,
  varPrefix: alarm.varPrefix,
  applicationLogsLabel: 'Log M2M gateway',
});
export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  knownError({
    code: 'INTEROP_APIGW_IAV2A5_API-V2-END-CON-CLO',
    description: 'Connessione dell’API Gateway con l’endpoint chiusa durante una richiesta a un tenant',
    regex: 'Execution failed due to a network error communicating with endpoint:\\s*Connection is closed',
    evidence: 'API_GATEWAY',
    environments: ['test'],
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: [],
    links: [],
  }),
  knownError({
    code: 'INTEROP_APIGW_IAV2A5_API-V2-UNE-API-CLI-KIN',
    description: 'Client kind API inatteso, forzato a risposta HTTP 500',
    regex: 'errors:\\s*012-0021[^\\n]*Unexpected client kind',
    environments: ['test'],
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: [],
    links: [
      {
        url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1773249336082199',
        name: 'Thread client kind 11/03/2026',
        type: 'SLACK',
      },
      {
        url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1773327512497479',
        name: 'Thread client kind 12/03/2026',
        type: 'SLACK',
      },
    ],
  }),
  knownError({
    code: 'INTEROP_APIGW_IAV2A5_API-V2-DUP-EVE-VER',
    description: 'Versione evento duplicata durante la creazione di una purpose',
    regex: 'duplicate key value violates unique constraint[^\\n]*events_stream_id_version_key',
    resolution: 'Nessuna azione necessaria.',
    proposedStatus: 'IN_PROGRESS',
    resources: ['interop-be-authorization-process'],
    finalActions: [],
    links: [],
  }),
  knownError({
    code: 'INTEROP_APIGW_IAV2A5_API-V2-BAC-TIM-504',
    description: 'Timeout di integrazione API Gateway con risposta 504',
    regex: 'Execution failed due to a timeout error',
    evidence: 'API_GATEWAY',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: [],
    links: [],
  }),
];
