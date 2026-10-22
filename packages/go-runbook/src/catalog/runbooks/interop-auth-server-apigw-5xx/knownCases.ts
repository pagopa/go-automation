import type { KnownCase } from '../framework.js';
import { any, not } from '../common/conditions.js';

import { stepEvidenceMatches } from '../common/evidenceConditions.js';
import { createInteropApiGwKnownCaseFactory } from '../interop/interopApiGwKnownCases.js';
import { AUTH_SERVER_5XX_ALARM as alarm } from './alarmDefinition.js';
import {
  AUDIT_FALLBACK_CONFIRMED_VAR,
  AUDIT_FALLBACK_PATTERN,
  AUDIT_FALLBACK_SEQUENCE_CONFIRMED_VAR,
  KAFKA_LOCK_PATTERN,
} from './AnalyzeAuditFallbackStep.js';
const knownCase = createInteropApiGwKnownCaseFactory({
  apiGatewayStepId: alarm.stepIds.queryApiGwAggregates,
  applicationLogsStepId: alarm.stepIds.queryApplicationLogs,
  cidTrackerStepId: alarm.stepIds.queryCidTracker,
  varPrefix: alarm.varPrefix,
  applicationLogsLabel: 'Log authorization-server',
});
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
const apiGatewayFallbackEvidence = stepEvidenceMatches(alarm.stepIds.queryApiGwAggregates, AUDIT_FALLBACK_PATTERN);
const STANDALONE_KAFKA_LOCK_PATTERN = `^(?![^\\n]*${AUDIT_FALLBACK_PATTERN})[^\\n]*${KAFKA_LOCK_PATTERN}`;
/** Nine documented families; audit fallback is split by verified outcome. */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'auth-server-invalid-identity-token',
    description: 'Impossibile recuperare la chiave dall’identity provider',
    priority: 690,
    regex: "InvalidIdentityTokenException:[^\\n]*Couldn't retrieve verification key from your identity provider",
    resolution: 'Restart del pod; operazione non eseguibile dal gruppo GO.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: [],
    links: [
      {
        url: 'https://pagopaspa.slack.com/archives/C06D24MANNN/p1755683601624099',
        name: 'Thread InvalidIdentityTokenException',
        type: 'SLACK',
      },
    ],
  }),
  knownCase({
    id: 'auth-server-waf-call-failed',
    description: 'Chiamata WAF fallita',
    priority: 680,
    regex: 'wafError:\\s*Failed to call WAF',
    resolution: 'In attesa di riscontro.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: [],
    links: [
      {
        url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1774344205186939',
        name: 'Thread errore WAF',
        type: 'SLACK',
      },
    ],
  }),
  knownCase({
    id: 'auth-server-stream-not-readable',
    description: 'Errore 007-9991 o stream non leggibile su token.oauth2',
    priority: 670,
    regex: 'errors:\\s*007-9991[^\\n]*Unexpected error|Error in request:\\s*stream is not readable',
    resolution: 'Card: PIN-10908',
    proposedStatus: 'IN_PROGRESS',
    links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-10908', name: 'PIN-10908', type: 'JIRA' }],
    finalActions: [],
  }),
  knownCase({
    id: 'auth-server-endpoint-connection-reset',
    description: 'Connessione API Gateway verso endpoint interrotta',
    priority: 660,
    regex: 'Execution failed due to a network error communicating with endpoint:\\s*Connection reset by peer',
    evidence: 'API_GATEWAY',
    resolution: 'Thread Slack 25/08/2026 Card: PIN-10908',
    proposedStatus: 'IN_PROGRESS',
    links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-10908', name: 'PIN-10908', type: 'JIRA' }],
    finalActions: [],
  }),
  knownCase({
    id: 'auth-server-audit-fallback-unverified',
    description: 'Fallback audit S3 senza conferma completa di recupero',
    priority: 650,
    regex: AUDIT_FALLBACK_PATTERN,
    resolution:
      'Se i log riportano la scrittura del file token-details nel bucket di fallback, Auditing succeeded through fallback e Token generated, il salvataggio delle informazioni di audit e la generazione del token sono andati a buon fine.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: [],
    guard: any(not(fallbackSequenceConfirmed), apiGatewayFallbackEvidence),
    links: [],
  }),
  knownCase({
    id: 'auth-server-kafka-lock-timeout',
    description: 'Timeout durante la connessione ai broker Kafka',
    priority: 640,
    regex: STANDALONE_KAFKA_LOCK_PATTERN,
    resolution: 'Thread Slack 04/06/2026 PIN-10908',
    proposedStatus: 'IN_PROGRESS',
    finalActions: [],
    links: [],
  }),
  {
    ...knownCase({
      id: 'auth-server-audit-fallback-succeeded',
      description: 'Audit salvato tramite fallback S3 e token generato',
      priority: 190,
      regex: AUDIT_FALLBACK_PATTERN,
      resolution:
        'Se i log riportano la scrittura del file token-details nel bucket di fallback, Auditing succeeded through fallback e Token generated, il salvataggio delle informazioni di audit e la generazione del token sono andati a buon fine.',
      proposedStatus: 'COMPLETED',
      finalActions: [],
      links: [],
    }),
    condition: fallbackConfirmed,
  },
  knownCase({
    id: 'auth-server-invalid-client-assertion-header',
    description: 'Client assertion con chiavi header non valide',
    priority: 180,
    regex: 'Invalid claims in client assertion header:[^\\n]*unrecognized_keys[^\\n]*x5c[^\\n]*use',
    resolution: 'Picco di richieste malformate contenenti chiavi non valide',
    proposedStatus: 'COMPLETED',
    guard: fallbackCompletionAllowed,
    finalActions: [],
    links: [],
  }),
  knownCase({
    id: 'auth-server-waf-timeout',
    description: 'Timeout temporaneo del WAF',
    priority: 170,
    regex: 'WAF call got timed out',
    resolution: 'Nessun intervento necessario. Disservizio temporaneo del WAF AWS.',
    proposedStatus: 'COMPLETED',
    guard: fallbackCompletionAllowed,
    finalActions: [],
    links: [],
  }),
  knownCase({
    id: 'auth-server-api-gateway-timeout',
    description: 'Timeout API Gateway oltre 29000 ms',
    priority: 160,
    regex: 'Execution failed due to a timeout error',
    evidence: 'API_GATEWAY',
    resolution: 'Errore di rete temporaneo.',
    proposedStatus: 'COMPLETED',
    guard: fallbackCompletionAllowed,
    finalActions: [],
    links: [],
  }),
];
