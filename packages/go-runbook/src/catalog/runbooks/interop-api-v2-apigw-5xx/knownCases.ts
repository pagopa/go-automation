import type { KnownCase } from '../framework.js';
import { slackLink } from '../common/analysisLinks.js';
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
    resolution:
      'Il documento riporta il caso in test per /tenants/{tenantId}, senza log applicativi. ' +
      'Verificare la richiesta, la disponibilità dell’integrazione e gli eventuali log del backend; l’assenza di log non dimostra il recupero.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: [
      'Correlare il 504 con requestPath e intervallo temporale',
      'Verificare l’endpoint e il backend coinvolti',
    ],
  }),
  knownCase({
    id: 'api-v2-unexpected-api-client-kind',
    description: 'Client kind API inatteso, forzato a risposta HTTP 500',
    priority: 390,
    regex: 'errors:\\s*012-0021[^\\n]*Unexpected client kind',
    environments: ['test'],
    resolution:
      'Il messaggio è classificato WARN ma forceGenericProblemOn500 restituisce 500. ' +
      'Identificare client e CID e chiedere al team di prodotto se serve la hotfix citata nei thread; il documento non ne conferma l’esito.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: ['Verificare client e CID coinvolti', 'Chiedere al team di prodotto lo stato della eventuale hotfix'],
    links: [
      slackLink('https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1773249336082199', 'Thread client kind 11/03/2026'),
      slackLink('https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1773327512497479', 'Thread client kind 12/03/2026'),
    ],
  }),
  knownCase({
    id: 'api-v2-duplicate-event-version',
    description: 'Versione evento duplicata durante la creazione di una purpose',
    priority: 380,
    regex: 'duplicate key value violates unique constraint[^\\n]*events_stream_id_version_key',
    resolution:
      'Il documento attribuisce il 500 a richieste identiche ravvicinate e dice che di solito esiste un precedente 2xx. ' +
      'Verificare per lo stesso client, purpose e intervallo che la richiesta precedente sia riuscita prima di chiudere il caso.',
    proposedStatus: 'IN_PROGRESS',
    resources: ['interop-be-authorization-process'],
    finalActions: [
      'Confrontare la richiesta POST /clients/{clientId}/purposes con la precedente',
      'Confermare il 2xx e lo stato finale della purpose',
    ],
  }),
  knownCase({
    id: 'api-v2-backend-timeout-504',
    description: 'Timeout di integrazione API Gateway con risposta 504',
    priority: 200,
    regex: 'Execution failed due to a timeout error',
    evidence: 'API_GATEWAY',
    resolution:
      'Il backend non ha risposto all’API Gateway entro il timeout. Cercare i log applicativi per requestPath, ' +
      'orario e CID; un log 200 non prova da solo che sia la stessa richiesta né che il client abbia ricevuto successo.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: [
      'Correlare il 504 con i log del backend e il CID',
      'Verificare eventuale completamento successivo della stessa richiesta',
    ],
  }),
];
