import { createInteropApiGwKnownErrorFactory } from '../../../../toolkits/interop/index.js';
import { any, type KnownError } from '../../../../engine/index.js';
import { AUTH_SERVER_5XX_ALARM as alarm } from './alarmDefinition.js';
import {
  AUDIT_FALLBACK_CONFIRMED_VAR,
  AUDIT_FALLBACK_PATTERN,
  AUDIT_FALLBACK_SEQUENCE_CONFIRMED_VAR,
  KAFKA_LOCK_PATTERN,
} from './AnalyzeAuditFallbackStep.js';

const knownError = createInteropApiGwKnownErrorFactory({
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
/** The sequence is a derived value with three states: a negation reads the explicit `false`, never the absence of `true`. */
const fallbackSequence = (value: 'true' | 'false' | 'unknown') =>
  ({ ...fallbackConfirmed, ref: `vars.${AUDIT_FALLBACK_SEQUENCE_CONFIRMED_VAR}`, value }) as const;
/** Completion needs an explicit answer: no fallback sequence on complete evidence, or a fully confirmed fallback. */
const fallbackCompletionAllowed = any(fallbackSequence('false'), fallbackConfirmed);
const STANDALONE_KAFKA_LOCK_PATTERN = `^(?![^\\n]*${AUDIT_FALLBACK_PATTERN})[^\\n]*${KAFKA_LOCK_PATTERN}`;
const FALLBACK_RESOLUTION =
  'Se i log riportano la scrittura del file token-details nel bucket di fallback, Auditing succeeded through fallback e Token generated, il salvataggio delle informazioni di audit e la generazione del token sono andati a buon fine.';

/** Sources: Confluence 2111078419 v14/v16/v18/v20/v24-v28. All documented cases concern Prod. */
export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  knownError({
    code: 'INTEROP_APIGW_IASA5_AUT-SER-INV-IDE-TOK',
    description: 'Impossibile recuperare la chiave dall’identity provider',
    regex: "InvalidIdentityTokenException:[^\\n]*Couldn't retrieve verification key from your identity provider",
    evidence: 'APPLICATION_LOGS',
    environments: ['prod'],
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
  knownError({
    code: 'INTEROP_APIGW_IASA5_AUT-SER-WAF-CAL-FAI',
    description: 'Chiamata WAF fallita',
    regex: 'wafError:\\s*Failed to call WAF',
    evidence: 'APPLICATION_LOGS',
    environments: ['prod'],
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
  knownError({
    code: 'INTEROP_APIGW_IASA5_AUT-SER-STR-NOT-REA',
    description: 'Errore 007-9991 o stream non leggibile su token.oauth2',
    regex: 'errors:\\s*007-9991[^\\n]*Unexpected error|Error in request:\\s*stream is not readable',
    evidence: 'APPLICATION_LOGS',
    environments: ['prod'],
    resolution: 'Card: PIN-10908',
    proposedStatus: 'IN_PROGRESS',
    links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-10908', name: 'PIN-10908', type: 'JIRA' }],
    finalActions: [],
  }),
  knownError({
    code: 'INTEROP_APIGW_IASA5_AUT-SER-END-CON-RES',
    description: 'Connessione API Gateway verso endpoint interrotta',
    regex: 'Execution failed due to a network error communicating with endpoint:\\s*Connection reset by peer',
    evidence: 'API_GATEWAY',
    environments: ['prod'],
    resolution: 'Thread Slack 25/08/2026. Card: PIN-10908',
    proposedStatus: 'IN_PROGRESS',
    links: [
      { url: 'https://pagopa.atlassian.net/browse/PIN-10908', name: 'PIN-10908', type: 'JIRA' },
      {
        url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1787672262507129',
        name: 'Thread Slack 25/08/2026',
        type: 'SLACK',
      },
    ],
    finalActions: [],
  }),
  knownError({
    code: 'INTEROP_APIGW_IASA5_AUT-SER-AUD-FAL-UNV',
    description: 'Fallback audit S3 senza conferma completa di recupero',
    regex: AUDIT_FALLBACK_PATTERN,
    evidence: 'APPLICATION_LOGS',
    environments: ['prod'],
    // Unverified: the sequence is not confirmed, or the evidence to confirm it is incomplete.
    guard: any(fallbackSequence('false'), fallbackSequence('unknown')),
    resolution: FALLBACK_RESOLUTION,
    proposedStatus: 'IN_PROGRESS',
    finalActions: [],
    links: [
      {
        url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1779262024581849?thread_ts=1778859335.710919&cid=C0A7F9XQAT0',
        name: 'Thread Slack 15/05/2026',
        type: 'SLACK',
      },
    ],
  }),
  knownError({
    code: 'INTEROP_APIGW_IASA5_AUT-SER-KAF-LOC-TIM',
    description: 'Timeout durante la connessione ai broker Kafka',
    regex: STANDALONE_KAFKA_LOCK_PATTERN,
    evidence: 'APPLICATION_LOGS',
    environments: ['prod'],
    resolution:
      'Al momento non è necessario aprire una card di Hotfix. Avvisare il team di prodotto nel caso in cui l’errore dovesse ripetersi. Riferimenti: Thread Slack 04/06/2026; PIN-10908.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: [],
    links: [
      {
        url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1780585244252059',
        name: 'Thread Slack 04/06/2026',
        type: 'SLACK',
      },
      { url: 'https://pagopa.atlassian.net/browse/PIN-10908', name: 'PIN-10908', type: 'JIRA' },
    ],
  }),
  knownError({
    code: 'INTEROP_APIGW_IASA5_AUT-SER-API-GAT-TIM',
    description: 'Timeout API Gateway oltre 29000 ms',
    regex: 'Execution failed due to a timeout error',
    evidence: 'API_GATEWAY',
    environments: ['prod'],
    resolution: 'Errore di rete temporaneo. Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: [],
    links: [],
  }),
  knownError({
    code: 'INTEROP_APIGW_IASA5_AUT-SER-AUD-FAL-SUC',
    description: 'Audit salvato tramite fallback S3 e token generato',
    regex: AUDIT_FALLBACK_PATTERN,
    evidence: 'APPLICATION_LOGS',
    environments: ['prod'],
    guard: fallbackSequence('true'),
    resolution: FALLBACK_RESOLUTION,
    // The source establishes the request outcome, not resolution of the HTTP 5xx alarm.
    proposedStatus: 'IN_PROGRESS',
    finalActions: [],
    links: [
      {
        url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1779262024581849?thread_ts=1778859335.710919&cid=C0A7F9XQAT0',
        name: 'Thread Slack 15/05/2026',
        type: 'SLACK',
      },
    ],
  }),
  knownError({
    code: 'INTEROP_APIGW_IASA5_AUT-SER-INV-CLI-ASS-HEA',
    description: 'Client assertion con chiavi header non valide',
    regex: 'Invalid claims in client assertion header:[^\\n]*unrecognized_keys[^\\n]*x5c[^\\n]*use',
    evidence: 'APPLICATION_LOGS',
    environments: ['prod'],
    resolution: 'Picco di richieste malformate contenenti chiavi non valide. Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: [],
    links: [],
  }),
  knownError({
    code: 'INTEROP_APIGW_IASA5_AUT-SER-WAF-TIM',
    description: 'Timeout temporaneo del WAF',
    regex: 'WAF call got timed out',
    evidence: 'APPLICATION_LOGS',
    environments: ['prod'],
    guard: fallbackCompletionAllowed,
    resolution: 'Nessun intervento necessario. Disservizio temporaneo del WAF AWS.',
    proposedStatus: 'COMPLETED',
    finalActions: [],
    links: [],
  }),
];
