import { knownCase, type KnownCase } from '../framework.js';
import { all, any, not } from '../common/conditions.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';
import { AUTH_SERVER_5XX_ALARM as alarm } from './alarmDefinition.js';
import {
  AUDIT_FALLBACK_CONFIRMED_VAR,
  AUDIT_FALLBACK_PATTERN,
  AUDIT_FALLBACK_SEQUENCE_CONFIRMED_VAR,
  KAFKA_LOCK_PATTERN,
} from './AnalyzeAuditFallbackStep.js';

const PRODUCTION = { type: 'compare', ref: 'vars.interopEnvironment', operator: '==', value: 'prod' } as const;
const DETAILS = [
  ['Ambiente', '{{vars.interopEnvironment}}'],
  ['API Gateway ID', '{{vars.interopApiGwId}}'],
  ['Servizio', '{{vars.interopPodApp}}'],
  ['Log authorization-server', `{{vars.${alarm.varPrefix}LogCount}}`],
  ['CID analizzati', `{{vars.${alarm.varPrefix}CidCount}}`],
] as const;
const fallbackConfirmed = {
  type: 'compare',
  ref: `vars.${AUDIT_FALLBACK_CONFIRMED_VAR}`,
  operator: '==',
  value: 'true',
} as const;
const fallbackSequenceConfirmed = {
  ...fallbackConfirmed,
  ref: `vars.${AUDIT_FALLBACK_SEQUENCE_CONFIRMED_VAR}`,
};
const fallbackCompletionAllowed = any(not(fallbackSequenceConfirmed), fallbackConfirmed);
const STANDALONE_KAFKA_LOCK_PATTERN = `^(?![^\\n]*${AUDIT_FALLBACK_PATTERN})[^\\n]*${KAFKA_LOCK_PATTERN}`;
const FALLBACK_RESOLUTION =
  'Se i log riportano la scrittura del file token-details nel bucket di fallback, Auditing succeeded through fallback e Token generated, il salvataggio delle informazioni di audit e la generazione del token sono andati a buon fine.';

/** Sources: Confluence 2111078419 v14/v16/v18/v20/v24-v28. All documented cases concern Prod. */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'auth-server-invalid-identity-token',
    description: 'Impossibile recuperare la chiave dall’identity provider',
    priority: 690,
    condition: all(
      PRODUCTION,
      stepEvidenceMatches(
        alarm.stepIds.queryApplicationLogs,
        "InvalidIdentityTokenException:[^\\n]*Couldn't retrieve verification key from your identity provider",
      ),
    ),
    resolution: 'Restart del pod; operazione non eseguibile dal gruppo GO.',
    details: DETAILS,
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [
        {
          url: 'https://pagopaspa.slack.com/archives/C06D24MANNN/p1755683601624099',
          name: 'Thread InvalidIdentityTokenException',
          type: 'SLACK',
        },
      ],
    },
  }),
  knownCase({
    id: 'auth-server-waf-call-failed',
    description: 'Chiamata WAF fallita',
    priority: 680,
    condition: all(
      PRODUCTION,
      stepEvidenceMatches(alarm.stepIds.queryApplicationLogs, 'wafError:\\s*Failed to call WAF'),
    ),
    resolution: 'In attesa di riscontro.',
    details: DETAILS,
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [
        {
          url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1774344205186939',
          name: 'Thread errore WAF',
          type: 'SLACK',
        },
      ],
    },
  }),
  knownCase({
    id: 'auth-server-stream-not-readable',
    description: 'Errore 007-9991 o stream non leggibile su token.oauth2',
    priority: 670,
    condition: all(
      PRODUCTION,
      stepEvidenceMatches(
        alarm.stepIds.queryApplicationLogs,
        'errors:\\s*007-9991[^\\n]*Unexpected error|Error in request:\\s*stream is not readable',
      ),
    ),
    resolution: 'Card: PIN-10908',
    details: DETAILS,
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-10908', name: 'PIN-10908', type: 'JIRA' }],
      finalActions: [],
    },
  }),
  knownCase({
    id: 'auth-server-endpoint-connection-reset',
    description: 'Connessione API Gateway verso endpoint interrotta',
    priority: 660,
    condition: all(
      PRODUCTION,
      stepEvidenceMatches(
        alarm.stepIds.queryApiGwAggregates,
        'Execution failed due to a network error communicating with endpoint:\\s*Connection reset by peer',
      ),
    ),
    resolution: 'Thread Slack 25/08/2026. Card: PIN-10908',
    details: DETAILS,
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      links: [
        { url: 'https://pagopa.atlassian.net/browse/PIN-10908', name: 'PIN-10908', type: 'JIRA' },
        {
          url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1787672262507129',
          name: 'Thread Slack 25/08/2026',
          type: 'SLACK',
        },
      ],
      finalActions: [],
    },
  }),
  knownCase({
    id: 'auth-server-audit-fallback-unverified',
    description: 'Fallback audit S3 senza conferma completa di recupero',
    priority: 650,
    condition: all(
      PRODUCTION,
      stepEvidenceMatches(alarm.stepIds.queryApplicationLogs, AUDIT_FALLBACK_PATTERN),
      not(fallbackSequenceConfirmed),
    ),
    resolution: FALLBACK_RESOLUTION,
    details: DETAILS,
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [
        {
          url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1779262024581849?thread_ts=1778859335.710919&cid=C0A7F9XQAT0',
          name: 'Thread Slack 15/05/2026',
          type: 'SLACK',
        },
      ],
    },
  }),
  knownCase({
    id: 'auth-server-kafka-lock-timeout',
    description: 'Timeout durante la connessione ai broker Kafka',
    priority: 640,
    condition: all(PRODUCTION, stepEvidenceMatches(alarm.stepIds.queryApplicationLogs, STANDALONE_KAFKA_LOCK_PATTERN)),
    resolution:
      'Al momento non è necessario aprire una card di Hotfix. Avvisare il team di prodotto nel caso in cui l’errore dovesse ripetersi. Riferimenti: Thread Slack 04/06/2026; PIN-10908.',
    details: DETAILS,
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [
        {
          url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1780585244252059',
          name: 'Thread Slack 04/06/2026',
          type: 'SLACK',
        },
        { url: 'https://pagopa.atlassian.net/browse/PIN-10908', name: 'PIN-10908', type: 'JIRA' },
      ],
    },
  }),
  knownCase({
    id: 'auth-server-api-gateway-timeout',
    description: 'Timeout API Gateway oltre 29000 ms',
    priority: 630,
    condition: all(
      PRODUCTION,
      stepEvidenceMatches(alarm.stepIds.queryApiGwAggregates, 'Execution failed due to a timeout error'),
    ),
    resolution: 'Errore di rete temporaneo. Risoluzione non documentata.',
    details: DETAILS,
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'auth-server-audit-fallback-succeeded',
    description: 'Audit salvato tramite fallback S3 e token generato',
    priority: 190,
    condition: all(
      PRODUCTION,
      stepEvidenceMatches(alarm.stepIds.queryApplicationLogs, AUDIT_FALLBACK_PATTERN),
      fallbackSequenceConfirmed,
    ),
    resolution: FALLBACK_RESOLUTION,
    details: DETAILS,
    analysis: {
      // The source establishes the request outcome, not resolution of the HTTP 5xx alarm.
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [
        {
          url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1779262024581849?thread_ts=1778859335.710919&cid=C0A7F9XQAT0',
          name: 'Thread Slack 15/05/2026',
          type: 'SLACK',
        },
      ],
    },
  }),
  knownCase({
    id: 'auth-server-invalid-client-assertion-header',
    description: 'Client assertion con chiavi header non valide',
    priority: 180,
    condition: all(
      PRODUCTION,
      stepEvidenceMatches(
        alarm.stepIds.queryApplicationLogs,
        'Invalid claims in client assertion header:[^\\n]*unrecognized_keys[^\\n]*x5c[^\\n]*use',
      ),
    ),
    resolution: 'Picco di richieste malformate contenenti chiavi non valide. Risoluzione non documentata.',
    details: DETAILS,
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'auth-server-waf-timeout',
    description: 'Timeout temporaneo del WAF',
    priority: 170,
    condition: all(
      PRODUCTION,
      stepEvidenceMatches(alarm.stepIds.queryApplicationLogs, 'WAF call got timed out'),
      fallbackCompletionAllowed,
    ),
    resolution: 'Nessun intervento necessario. Disservizio temporaneo del WAF AWS.',
    details: DETAILS,
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [],
    },
  }),
];
