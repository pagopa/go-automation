import { knownCase } from '../framework.js';
import type { Condition, KnownCase } from '../framework.js';

import { slackLink } from '../common/analysisLinks.js';
import { all, any } from '../common/conditions.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';
import { varEquals } from '../common/varConditions.js';

const INCIDENT_THREAD = 'https://pagopaspa.slack.com/archives/C064KJYNLPL/p1790086829253919';

const INVALID_SENDER_LIMIT: Condition = any(
  stepEvidenceMatches('query-pn-delayer-sender-limit-job', 'Invalid sender limit percentage \\['),
  stepEvidenceMatches(
    'query-pn-delayer-sender-limit-job',
    'Invalid senderLimit percentage: job will fail without retry',
  ),
);

const DETAILS = [
  ['Servizio', 'pn-delayer'],
  ['Job', 'pn-delayer-sender-limit-job'],
  ['Errore', '{{vars.delayerSenderLimitJobErrorMsg}}'],
  ['Trace ID', '{{vars.delayerSenderLimitJobTraceId}}'],
] as const;

/** The same documented failure has different operational outcomes on Monday. */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'invalid-sender-limit-monday',
    description: 'Percentuale sender limit non valida nel job pn-delayer, occorrenza di lunedì',
    priority: 110,
    condition: all(INVALID_SENDER_LIMIT, varEquals('delayerAlarmIncludesMonday', 'true')),
    title: 'Sender limit non valido: verifica del lunedì',
    resolution:
      'Avvisare il prodotto e verificare la presenza dell’allarme pn-BatchWorkflowStateMachine-FailedAlarm. ' +
      'Mantenere aperta l’analisi finché entrambe le verifiche non sono concluse.',
    details: DETAILS,
    level: 'warn',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Percentuale sender limit non valida: il job fallisce senza retry.',
      finalActions: [
        'Avvisare il prodotto',
        'Verificare la presenza dell’allarme pn-BatchWorkflowStateMachine-FailedAlarm',
      ],
      links: [slackLink(INCIDENT_THREAD, 'Thread Slack del caso noto')],
    },
  }),
  knownCase({
    id: 'invalid-sender-limit-other-day',
    description: 'Percentuale sender limit non valida nel job pn-delayer, occorrenza non di lunedì',
    priority: 100,
    condition: all(INVALID_SENDER_LIMIT, varEquals('delayerAlarmIncludesMonday', 'false')),
    title: 'Sender limit non valido: caso noto',
    resolution: 'Caso noto. Fuori dal lunedì la pagina operativa non richiede alcuna azione.',
    details: DETAILS,
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Percentuale sender limit non valida: il job fallisce senza retry.',
      links: [slackLink(INCIDENT_THREAD, 'Thread Slack del caso noto')],
    },
  }),
];
