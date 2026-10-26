import type { KnownCase } from '../framework.js';

import { createInteropApiGwKnownCaseFactory } from '../interop/interopApiGwKnownCases.js';
import { INTEROP_API_V2_5XX_ALARM as alarm } from './alarmDefinition.js';
const knownCase = createInteropApiGwKnownCaseFactory({
  apiGatewayStepId: alarm.stepIds.queryApiGwAggregates,
  applicationLogsStepId: alarm.stepIds.queryApplicationLogs,
  cidTrackerStepId: alarm.stepIds.queryCidTracker,
  varPrefix: alarm.varPrefix,
  applicationLogsLabel: 'Log M2M gateway',
});
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'api-v2-endpoint-connection-closed',
    description: 'Connessione dell’API Gateway con l’endpoint chiusa durante una richiesta a un tenant',
    priority: 400,
    regex: 'Execution failed due to a network error communicating with endpoint:\\s*Connection is closed',
    evidence: 'API_GATEWAY',
    environments: ['test'],
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: [],
    links: [],
  }),
  knownCase({
    id: 'api-v2-unexpected-api-client-kind',
    description: 'Client kind API inatteso, forzato a risposta HTTP 500',
    priority: 390,
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
  knownCase({
    id: 'api-v2-duplicate-event-version',
    description: 'Versione evento duplicata durante la creazione di una purpose',
    priority: 380,
    regex: 'duplicate key value violates unique constraint[^\\n]*events_stream_id_version_key',
    resolution: 'Nessuna azione necessaria.',
    proposedStatus: 'IN_PROGRESS',
    resources: ['interop-be-authorization-process'],
    finalActions: [],
    links: [],
  }),
  knownCase({
    id: 'api-v2-backend-timeout-504',
    description: 'Timeout di integrazione API Gateway con risposta 504',
    priority: 200,
    regex: 'Execution failed due to a timeout error',
    evidence: 'API_GATEWAY',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: [],
    links: [],
  }),
];
