import type { AnalysisLinkRef, CaseAction, Condition, KnownCase } from '../framework.js';
import type { InteropEnvironment } from '../interop/InteropEnvironment.js';

import {
  QUERY_INTEROP_API_GW_4XX_STEP_ID,
  QUERY_INTEROP_AUTH_SERVER_CID_TRACKER_STEP_ID,
  QUERY_INTEROP_AUTH_SERVER_WARNINGS_STEP_ID,
} from './runbookSteps.js';

interface InteropAuthServerKnownCaseConfig {
  readonly id: string;
  readonly description: string;
  readonly priority: number;
  readonly regex: string;
  readonly resolution: string;
  readonly proposedStatus: 'IN_PROGRESS' | 'COMPLETED';
  readonly evidence?: 'ANY' | 'API_GATEWAY';
  readonly environments?: ReadonlyArray<InteropEnvironment>;
  readonly finalActions?: ReadonlyArray<string>;
  readonly links?: ReadonlyArray<AnalysisLinkRef>;
}

const PRODUCT_REVIEW_ACTION = 'Necessario confronto con il team di prodotto';
const DEPLOYMENT_DOCUMENTATION =
  'https://github.com/pagopa/interop-core-deployment/tree/main/microservices/authorization-server-node';
const AUDIENCE_EXAMPLE = 'https://pagopaspa.slack.com/archives/C06D24MANNN/p1763121511282499';
const TEST_RATE_LIMIT_THREAD = 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1779291404615129';
const TOKEN_STATE_THREAD = 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1773161605955019';
const UNEXPECTED_KID_THREAD =
  'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1780490021408979?thread_ts=1780471525.339529&cid=C0A7F9XQAT0';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'auth-server-test-rate-limit-known-organization',
    description: 'Rate limit noto dell’organizzazione di test',
    priority: 570,
    regex:
      'Rate limit triggered for organization 738b2cc0-401b-4226-89ea-f49c9441d40f:\\s*' +
      'maximum of 10 requests in 1000ms exceeded\\.',
    resolution:
      'Il limite di 10 richieste al secondo è stato superato dall’organizzazione di test indicata. ' +
      'Il documento è in attesa di riscontro dal team di prodotto.',
    proposedStatus: 'IN_PROGRESS',
    environments: ['test'],
    finalActions: [PRODUCT_REVIEW_ACTION],
    links: [slack(TEST_RATE_LIMIT_THREAD, 'Thread rate limit ambiente test')],
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
      'Verificare CLIENT_ASSERTION_JWT_AUDIENCE nei values dell’ambiente: prod accetta ' +
      'auth.interop.pagopa.it/client-assertion, att e test auth.uat.interop.pagopa.it/client-assertion. ' +
      'Se la claim usa l’audience di un altro ambiente non è necessaria una segnalazione.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: [PRODUCT_REVIEW_ACTION],
    links: [
      { url: DEPLOYMENT_DOCUMENTATION, name: 'Deployment authorization-server-node', type: 'DOCUMENTATION' },
      slack(AUDIENCE_EXAMPLE, 'Esempio audience non valida'),
    ],
  }),
  knownCase({
    id: 'auth-server-organization-request-limit-exceeded',
    description: 'Limite di richieste superato per una organizzazione',
    priority: 550,
    regex: 'Too Many Requests\\s*-\\s*detail:\\s*Requests limit exceeded for organization',
    resolution:
      'Ricavare consumerId e nome dell’ente dai DB read_model client e tenant dell’ambiente usando ' +
      'organizationId/producerId/consumerId presenti nel messaggio, quindi valutare il confronto con il prodotto.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: [PRODUCT_REVIEW_ACTION],
  }),
  knownCase({
    id: 'auth-server-token-generation-state-entry-not-found',
    description: 'Entry assente nella tabella token-generation-states',
    priority: 540,
    regex: 'Entry with PK\\s+[^\\s]+\\s+not found in token-generation-states table',
    resolution:
      'Verificare client_id e kid nella vista read_model client.client_key e confrontarli con la PK DynamoDB. ' +
      'La risoluzione nel documento è marcata TBV, quindi il caso resta aperto.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: [PRODUCT_REVIEW_ACTION],
    links: [slack(TOKEN_STATE_THREAD, 'Thread token-generation-states')],
  }),
  knownCase({
    id: 'auth-server-client-assertion-signature-validation-failed',
    description: 'Validazione della firma della client assertion fallita',
    priority: 530,
    regex: 'Client assertion signature validation failed for client\\s+',
    resolution:
      'Identificare client ed ente tramite read_model e verificare chiave e firma della client assertion. ' +
      'Il documento non indica una risoluzione conclusiva.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: [PRODUCT_REVIEW_ACTION],
  }),
  knownCase({
    id: 'auth-server-unexpected-kid-format',
    description: 'Formato inatteso del kid nella client assertion',
    priority: 520,
    regex: 'Client assertion validation failed for clientId:\\s*[0-9a-fA-F-]+\\s*-\\s*Unexpected format for kid',
    resolution:
      'Identificare il client e l’ente e verificare il formato del kid inviato. ' +
      'Il documento non indica una risoluzione automatica.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: [PRODUCT_REVIEW_ACTION],
    links: [slack(UNEXPECTED_KID_THREAD, 'Thread formato kid inatteso')],
  }),
  knownCase({
    id: 'auth-server-platform-state-inactive',
    description: 'Agreement e Purpose inattivi durante la validazione di piattaforma',
    priority: 510,
    regex:
      'errors:\\s*007-0008,\\s*Platform state validation failed\\s*-\\s*' +
      'Agreement state is:\\s*INACTIVE,\\s*Purpose state is:\\s*INACTIVE',
    resolution:
      'Identificare client ed ente e verificare perché Agreement e Purpose risultano entrambi INACTIVE. ' +
      'Il documento non fornisce una risoluzione conclusiva.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: [PRODUCT_REVIEW_ACTION],
  }),
  knownCase({
    id: 'auth-server-api-gateway-forbidden-403',
    description: 'Richiesta autenticata ma non autorizzata bloccata da API Gateway',
    priority: 100,
    regex: 'API Gateway\\s+403\\b',
    resolution: 'La richiesta è stata bloccata direttamente da API Gateway: nessuna azione necessaria.',
    proposedStatus: 'COMPLETED',
    evidence: 'API_GATEWAY',
  }),
];

function knownCase(config: InteropAuthServerKnownCaseConfig): KnownCase {
  const evidenceCondition =
    config.evidence === 'API_GATEWAY' ? apiGatewayEvidenceMatches(config.regex) : anyEvidenceMatches(config.regex);
  const condition = withEnvironment(evidenceCondition, config.environments);
  return {
    id: config.id,
    description: config.description,
    priority: config.priority,
    condition,
    action: knownCaseAction(config.description, config.resolution),
    analysis: {
      resolution: config.resolution,
      proposedStatus: config.proposedStatus,
      analysisType: 'ANALYZABLE',
      ...(config.finalActions === undefined ? {} : { finalActions: config.finalActions }),
      ...(config.links === undefined ? {} : { links: config.links }),
    },
  };
}

function anyEvidenceMatches(regex: string): Condition {
  return {
    type: 'or',
    conditions: [
      apiGatewayEvidenceMatches(regex),
      { type: 'contains', ref: `steps.${QUERY_INTEROP_AUTH_SERVER_WARNINGS_STEP_ID}`, regex },
      { type: 'contains', ref: `steps.${QUERY_INTEROP_AUTH_SERVER_CID_TRACKER_STEP_ID}`, regex },
    ],
  };
}

function apiGatewayEvidenceMatches(regex: string): Condition {
  return { type: 'contains', ref: `steps.${QUERY_INTEROP_API_GW_4XX_STEP_ID}`, regex };
}

function withEnvironment(condition: Condition, environments: ReadonlyArray<InteropEnvironment> | undefined): Condition {
  if (environments === undefined) return condition;
  return {
    type: 'and',
    conditions: [{ type: 'contains', ref: 'vars.interopEnvironment', value: environments }, condition],
  };
}

function knownCaseAction(title: string, resolution: string): CaseAction {
  return {
    type: 'log',
    level: 'info',
    renderAs: 'known-case',
    message:
      `[CASO NOTO] ${title}\n` +
      `Risoluzione: ${resolution}\n` +
      'Ambiente: {{vars.interopEnvironment}}\n' +
      'API Gateway ID: {{vars.interopApiGwId}}\n' +
      'Servizio: {{vars.interopPodApp}}\n' +
      'Warning auth-server: {{vars.interopAuthServerLogCount}}\n' +
      'CID analizzati: {{vars.interopAuthServerCidCount}}\n',
  };
}

function slack(url: string, name: string): AnalysisLinkRef {
  return { url, name, type: 'SLACK' };
}
