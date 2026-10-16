import { AUTH_SERVER_ALARM } from './alarmDefinition.js';
import type { KnownCase } from '../framework.js';
import { slackLink } from '../common/analysisLinks.js';
import { createInteropApiGwKnownCaseFactory } from '../interop/interopApiGwKnownCases.js';

const PRODUCT_REVIEW_ACTION = 'Necessario confronto con il team di prodotto';
const DEPLOYMENT_DOCUMENTATION =
  'https://github.com/pagopa/interop-core-deployment/tree/main/microservices/authorization-server-node';
const AUDIENCE_EXAMPLE = 'https://pagopaspa.slack.com/archives/C06D24MANNN/p1763121511282499';
const TEST_RATE_LIMIT_THREAD = 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1779291404615129';
const TOKEN_STATE_THREAD = 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1773161605955019';
const UNEXPECTED_KID_THREAD =
  'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1780490021408979?thread_ts=1780471525.339529&cid=C0A7F9XQAT0';

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
    resolution:
      'Correlare il CID con la risposta HTTP 400 e verificare il client_id inviato nel body, senza copiare assertion o token. ' +
      'Far correggere al chiamante il valore UUID. Il messaggio identifica un errore di validazione della richiesta, ' +
      'ma non spiega gli altri 4xx della finestra. Verificare separatamente le altre firme e le richieste successive.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: ['Verificare client_id, correlazione CID/HTTP 400 e correzione della richiesta con il chiamante'],
  }),
  knownCase({
    id: 'auth-server-required-client-assertion-type',
    description: 'client_assertion_type richiesto ma non disponibile nel body',
    priority: 590,
    regex: String.raw`Validation error: Required at[\s\\"]+client_assertion_type\b`,
    resolution:
      'Correlare il CID con la risposta HTTP 400; verificare presenza e valore di client_assertion_type e ' +
      'Content-Type application/x-www-form-urlencoded. Il campo Required non prova da solo che sia stato inviato JSON. ' +
      'Far correggere al chiamante parametro o codifica e verificare le richieste successive, analizzando anche le altre firme 4xx.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: ['Verificare parametro, Content-Type e correzione della richiesta con il chiamante'],
  }),
  knownCase({
    id: 'auth-server-invalid-purpose-id-uuid',
    description: 'Purpose Id della client assertion non valido come UUID',
    priority: 580,
    regex: 'Purpose Id claim\\s+[^\\s]+\\s+is not a valid UUID',
    resolution:
      'Identificare client ed ente tramite CID e read_model; verificare il purposeId nella client assertion. ' +
      'Far correggere al chiamante il valore UUID e verificare una nuova richiesta prima di concludere. ' +
      'Non modificare lo stato della finalità per correggere un errore di formato.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: ['Verificare purposeId e correzione della client assertion con il chiamante'],
  }),
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
    links: [slackLink(TEST_RATE_LIMIT_THREAD, 'Thread rate limit ambiente test')],
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
      'Verificare CLIENT_ASSERTION_JWT_AUDIENCE nella configurazione attualmente distribuita. Il documento riporta ' +
      'auth.interop.pagopa.it/client-assertion per prod e auth.uat.interop.pagopa.it/client-assertion per att e test: ' +
      'confermare questi riferimenti per l’ambiente in analisi. ' +
      'Se la claim usa l’audience di un altro ambiente non è necessaria una segnalazione.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: [PRODUCT_REVIEW_ACTION],
    links: [
      { url: DEPLOYMENT_DOCUMENTATION, name: 'Deployment authorization-server-node', type: 'DOCUMENTATION' },
      slackLink(AUDIENCE_EXAMPLE, 'Esempio audience non valida'),
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
    links: [slackLink(TOKEN_STATE_THREAD, 'Thread token-generation-states')],
  }),
  knownCase({
    id: 'auth-server-client-assertion-not-before',
    description: 'Client assertion utilizzata prima dell’inizio validità',
    priority: 535,
    regex: 'Current time is before not before time in client assertion signature validation',
    resolution:
      'Correlare il CID con la risposta HTTP 400 e verificare nbf, iat, exp e sincronizzazione dell’orologio del chiamante. ' +
      'Il messaggio indica una validazione temporale fallita, non prova una firma crittografica errata. ' +
      'Verificare con il chiamante una nuova assertion valida e le richieste successive senza esporre token.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: ['Verificare validità temporale della assertion e orologio del chiamante'],
  }),
  knownCase({
    id: 'auth-server-client-assertion-expired',
    description: 'Client assertion scaduta',
    priority: 534,
    regex: 'Token expired in client assertion signature validation',
    resolution:
      'Correlare il CID con la risposta HTTP 400 e verificare exp, iat, nbf e sincronizzazione dell’orologio del chiamante. ' +
      'Far generare al chiamante una nuova client assertion valida senza riutilizzare quella scaduta; verificare le richieste successive. ' +
      'Il messaggio non dimostra una firma crittografica errata.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: ['Verificare scadenza della client assertion e nuova richiesta del chiamante'],
  }),
  knownCase({
    id: 'auth-server-client-assertion-signature-validation-failed',
    description: 'Validazione della firma della client assertion fallita',
    priority: 530,
    regex:
      'Client assertion signature validation failed for client\\s+[^\\s]+\\s*-\\s*Client assertion signature is invalid',
    resolution:
      'Identificare client ed ente tramite read_model e verificare chiave e firma della client assertion. ' +
      'Correlare il CID con la risposta 400 e verificare le richieste successive prima di concludere; ' +
      'una co-occorrenza con altri warning non dimostra una causa comune.',
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
    links: [slackLink(UNEXPECTED_KID_THREAD, 'Thread formato kid inatteso')],
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
    id: 'auth-server-platform-state-agreement-or-purpose-inactive',
    description: 'Agreement o Purpose inattivo durante la validazione di piattaforma',
    priority: 505,
    regex: 'Platform state validation failed\\s*-\\s*(?:Agreement|Purpose) state is:\\s*INACTIVE',
    resolution:
      'Identificare tramite CID client, accordo e finalità e verificarne lo stato nell’ambiente corretto. ' +
      'Il messaggio può riguardare soltanto Agreement o soltanto Purpose. ' +
      'Coinvolgere il team prodotto se lo stato non è quello atteso; non attivare accordi o finalità come azione automatica.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: [PRODUCT_REVIEW_ACTION],
  }),
  knownCase({
    id: 'auth-server-api-gateway-forbidden-403',
    description: 'Richiesta autenticata ma non autorizzata bloccata da API Gateway',
    priority: 100,
    regex: 'API Gateway\\s+403\\b',
    resolution:
      'Verificare integrationStatus, integrationError e i log della richiesta per distinguere un rifiuto del gateway ' +
      'da un 403 restituito dall’integrazione. Lo status 403 da solo non prova autenticazione riuscita né assenza di impatto. ' +
      'Concludere solo dopo aver verificato che il rifiuto sia atteso e aver analizzato gli altri errori della finestra.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: ['Verificare origine del 403, comportamento atteso e altri errori nella finestra'],
    evidence: 'API_GATEWAY',
  }),
];
