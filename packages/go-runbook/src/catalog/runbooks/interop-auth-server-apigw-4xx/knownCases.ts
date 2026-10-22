import { AUTH_SERVER_ALARM } from './alarmDefinition.js';
import type { KnownCase } from '../framework.js';

import { createInteropApiGwKnownCaseFactory } from '../interop/interopApiGwKnownCases.js';
const knownCase = createInteropApiGwKnownCaseFactory({
  apiGatewayStepId: AUTH_SERVER_ALARM.stepIds.queryApiGwAggregates,
  applicationLogsStepId: AUTH_SERVER_ALARM.stepIds.queryApplicationLogs,
  cidTrackerStepId: AUTH_SERVER_ALARM.stepIds.queryCidTracker,
  varPrefix: AUTH_SERVER_ALARM.varPrefix,
  applicationLogsLabel: 'Warning auth-server',
});
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'auth-server-invalid-client-id-uuid',
    description: 'client_id nel body non valido come UUID',
    priority: 600,
    regex: String.raw`Validation error: Invalid uuid at[\s\\"]+client_id\b`,
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: [],
    links: [],
  }),
  knownCase({
    id: 'auth-server-required-client-assertion-type',
    description: 'client_assertion_type richiesto ma non disponibile nel body',
    priority: 590,
    regex: String.raw`Validation error: Required at[\s\\"]+client_assertion_type\b`,
    resolution: 'Thread Slack 14/09/2026 Thread Slack 17/09/2026',
    proposedStatus: 'IN_PROGRESS',
    finalActions: [],
    links: [],
  }),
  knownCase({
    id: 'auth-server-invalid-purpose-id-uuid',
    description: 'Purpose Id della client assertion non valido come UUID',
    priority: 580,
    regex: 'Purpose Id claim\\s+[^\\s]+\\s+is not a valid UUID',
    resolution: 'Thread Slack 17/09/2026',
    proposedStatus: 'IN_PROGRESS',
    finalActions: [],
    links: [],
  }),
  knownCase({
    id: 'auth-server-test-rate-limit-known-organization',
    description: 'Rate limit noto dell’organizzazione di test',
    priority: 570,
    regex:
      'Rate limit triggered for organization 738b2cc0-401b-4226-89ea-f49c9441d40f:\\s*' +
      'maximum of 10 requests in 1000ms exceeded\\.',
    resolution: 'In attesa di feedback da parte del team di prodotto.',
    proposedStatus: 'IN_PROGRESS',
    environments: ['test'],
    finalActions: [],
    links: [
      {
        url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1779291404615129',
        name: 'Thread rate limit ambiente test',
        type: 'SLACK',
      },
    ],
  }),
  knownCase({
    id: 'auth-server-unexpected-client-assertion-audience',
    description: 'Audience della client assertion non valida per l’ambiente',
    priority: 560,
    regex: [
      'Client assertion validation failed for clientId:\\s*[^\\s,]+\\s*-\\s*',
      'Unexpected client assertion audience:',
    ].join(''),
    resolution:
      'Confrontare l\u2019audience della client assertion con CLIENT_ASSERTION_JWT_AUDIENCE dell\u2019ambiente, come indicato nelle verifiche finali del runbook. Se la richiesta usa l\u2019audience di un altro ambiente, non \u00E8 necessaria una segnalazione.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: [],
    links: [],
  }),
  knownCase({
    id: 'auth-server-organization-request-limit-exceeded',
    description: 'Limite di richieste superato per una organizzazione',
    priority: 550,
    regex: 'Too Many Requests\\s*-\\s*detail:\\s*Requests limit exceeded for organization',
    resolution:
      'Seguire le verifiche finali del runbook per identificare l\u2019ente tramite organizationId/consumerId nel read model. La notifica al team prodotto \u00E8 indicata come da definire.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: [],
    links: [],
  }),
  knownCase({
    id: 'auth-server-token-generation-state-entry-not-found',
    description: 'Entry assente nella tabella token-generation-states',
    priority: 540,
    regex: 'Entry with PK\\s+[^\\s]+\\s+not found in token-generation-states table',
    resolution:
      "[TBV] Query sul read model select client_id,kid from prod_client.client_key where client_id = '<CLIENT>'",
    proposedStatus: 'IN_PROGRESS',
    finalActions: [],
    links: [
      {
        url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1773161605955019',
        name: 'Thread token-generation-states',
        type: 'SLACK',
      },
    ],
  }),
  knownCase({
    id: 'auth-server-client-assertion-not-before',
    description: 'Client assertion utilizzata prima dell’inizio validità',
    priority: 535,
    regex: 'Current time is before not before time in client assertion signature validation',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: [],
    links: [],
  }),
  knownCase({
    id: 'auth-server-client-assertion-expired',
    description: 'Client assertion scaduta',
    priority: 534,
    regex: 'Token expired in client assertion signature validation',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: [],
    links: [],
  }),
  knownCase({
    id: 'auth-server-client-assertion-signature-validation-failed',
    description: 'Validazione della firma della client assertion fallita',
    priority: 530,
    regex:
      'Client assertion signature validation failed for client\\s+[^\\s]+\\s*-\\s*Client assertion signature is invalid',
    resolution: 'Thread Slack segnalazioni 25-27/08/2026 Thread Slack 17/09/2026',
    proposedStatus: 'IN_PROGRESS',
    finalActions: [],
    links: [],
  }),
  knownCase({
    id: 'auth-server-unexpected-kid-format',
    description: 'Formato inatteso del kid nella client assertion',
    priority: 520,
    regex: 'Client assertion validation failed for clientId:\\s*[0-9a-fA-F-]+\\s*-\\s*Unexpected format for kid',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: [],
    links: [],
  }),
  knownCase({
    id: 'auth-server-platform-state-inactive',
    description: 'Agreement e Purpose inattivi durante la validazione di piattaforma',
    priority: 510,
    regex:
      'errors:\\s*007-0008,\\s*Platform state validation failed\\s*-\\s*' +
      'Agreement state is:\\s*INACTIVE,\\s*Purpose state is:\\s*INACTIVE',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: [],
    links: [],
  }),
  knownCase({
    id: 'auth-server-platform-state-agreement-or-purpose-inactive',
    description: 'Agreement o Purpose inattivo durante la validazione di piattaforma',
    priority: 505,
    regex: 'Platform state validation failed\\s*-\\s*(?:Agreement|Purpose) state is:\\s*INACTIVE',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: [],
    links: [],
  }),
  knownCase({
    id: 'auth-server-api-gateway-forbidden-403',
    description: 'Richiesta autenticata ma non autorizzata bloccata da API Gateway',
    priority: 100,
    regex: 'API Gateway\\s+403\\b',
    resolution: 'Nessuna azione necessaria',
    proposedStatus: 'IN_PROGRESS',
    finalActions: [],
    evidence: 'API_GATEWAY',
    links: [],
  }),
];
