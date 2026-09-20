import type { KnownCase } from '../framework.js';
import { all, any, not } from '../common/conditions.js';
import { jiraLink, slackLink } from '../common/analysisLinks.js';
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
const apiGatewayFallbackEvidence = stepEvidenceMatches(alarm.stepIds.queryApiGwAggregates, AUDIT_FALLBACK_PATTERN);
const STANDALONE_KAFKA_LOCK_PATTERN = `^(?![^\\n]*${AUDIT_FALLBACK_PATTERN})[^\\n]*${KAFKA_LOCK_PATTERN}`;

function unlessCorrelatedFallbackRecovered(rule: KnownCase): KnownCase {
  return {
    ...rule,
    condition: all(rule.condition, any(not(fallbackSequenceConfirmed), apiGatewayFallbackEvidence)),
  };
}

/** Nine documented families; audit fallback is split by verified outcome. */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'auth-server-invalid-identity-token',
    description: 'Impossibile recuperare la chiave dall’identity provider',
    priority: 690,
    regex: "InvalidIdentityTokenException:[^\\n]*Couldn't retrieve verification key from your identity provider",
    resolution:
      'Richiedere al team competente la verifica e il restart del pod interessato; operazione non eseguibile dal gruppo GO.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: ['Richiedere al team competente il restart del pod interessato'],
    links: [
      slackLink(
        'https://pagopaspa.slack.com/archives/C06D24MANNN/p1755683601624099',
        'Thread InvalidIdentityTokenException',
      ),
    ],
  }),
  knownCase({
    id: 'auth-server-waf-call-failed',
    description: 'Chiamata WAF fallita',
    priority: 680,
    regex: 'wafError:\\s*Failed to call WAF',
    resolution:
      'Caso segnalato al team di prodotto, in attesa di riscontro: raccogliere le evidenze e aggiornare la segnalazione.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: ['Richiedere riscontro al team di prodotto sul fallimento WAF'],
    links: [slackLink('https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1774344205186939', 'Thread errore WAF')],
  }),
  knownCase({
    id: 'auth-server-stream-not-readable',
    description: 'Errore 007-9991 o stream non leggibile su token.oauth2',
    priority: 670,
    regex: 'errors:\\s*007-9991[^\\n]*Unexpected error|Error in request:\\s*stream is not readable',
    resolution:
      'Verificare PIN-10908 e correlare il CID con eventuali timeout Kafka; la vicinanza temporale non dimostra la causa.',
    proposedStatus: 'IN_PROGRESS',
    links: [jiraLink('PIN-10908')],
  }),
  knownCase({
    id: 'auth-server-endpoint-connection-reset',
    description: 'Connessione API Gateway verso endpoint interrotta',
    priority: 660,
    regex: 'Execution failed due to a network error communicating with endpoint:\\s*Connection reset by peer',
    evidence: 'API_GATEWAY',
    resolution: 'Verificare PIN-10908 e i log correlati alla richiesta POST /token.oauth2.',
    proposedStatus: 'IN_PROGRESS',
    links: [jiraLink('PIN-10908')],
  }),
  unlessCorrelatedFallbackRecovered(
    knownCase({
      id: 'auth-server-audit-fallback-unverified',
      description: 'Fallback audit S3 senza conferma completa di recupero',
      priority: 650,
      regex: AUDIT_FALLBACK_PATTERN,
      resolution:
        'Verificare per ogni CID la scrittura in S3, Auditing succeeded through fallback e Token generated. Senza queste evidenze non è confermato il rilascio del token. Correlare anche gli allarmi k8s-interop-be-authorization-server-node-errors e generated-jwt-fallback-write-activity con il suffisso dell’ambiente analizzato.',
      proposedStatus: 'IN_PROGRESS',
      finalActions: ['Verificare salvataggio audit e generazione token per tutti i CID coinvolti'],
    }),
  ),
  knownCase({
    id: 'auth-server-kafka-lock-timeout',
    description: 'Timeout durante la connessione ai broker Kafka',
    priority: 640,
    regex: STANDALONE_KAFKA_LOCK_PATTERN,
    resolution:
      'Non è richiesta una hotfix immediata. Verificare la ricorrenza e avvisare il team di prodotto se il problema si ripete.',
    proposedStatus: 'IN_PROGRESS',
    finalActions: ['Verificare ricorrenza e avvisare il team di prodotto se necessario'],
  }),
  {
    ...knownCase({
      id: 'auth-server-audit-fallback-succeeded',
      description: 'Audit salvato tramite fallback S3 e token generato',
      priority: 190,
      regex: AUDIT_FALLBACK_PATTERN,
      resolution:
        'Per tutti i CID coinvolti sono confermati scrittura audit su S3, successo del fallback e generazione del token.',
      proposedStatus: 'COMPLETED',
    }),
    condition: fallbackConfirmed,
  },
  knownCase({
    id: 'auth-server-invalid-client-assertion-header',
    description: 'Client assertion con chiavi header non valide',
    priority: 180,
    regex: 'Invalid claims in client assertion header:[^\\n]*unrecognized_keys[^\\n]*x5c[^\\n]*use',
    resolution: 'Picco di richieste malformate con chiavi x5c e use non valide nell’header della client assertion.',
    proposedStatus: 'COMPLETED',
  }),
  knownCase({
    id: 'auth-server-waf-timeout',
    description: 'Timeout temporaneo del WAF',
    priority: 170,
    regex: 'WAF call got timed out',
    resolution: 'Momentaneo disservizio del WAF; nessun intervento previsto dal runbook.',
    proposedStatus: 'COMPLETED',
  }),
  knownCase({
    id: 'auth-server-api-gateway-timeout',
    description: 'Timeout API Gateway oltre 29000 ms',
    priority: 160,
    regex: 'Execution failed due to a timeout error',
    evidence: 'API_GATEWAY',
    resolution:
      'Timeout temporaneo di rete oltre 29000 ms; solitamente non associato a errori del pod authorization-server.',
    proposedStatus: 'COMPLETED',
  }),
];
