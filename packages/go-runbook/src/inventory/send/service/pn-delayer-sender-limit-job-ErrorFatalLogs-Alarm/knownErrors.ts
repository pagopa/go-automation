import { knownError } from '../../../../toolkits/send/index.js';
import { all, any, type Condition, type KnownError, stepEvidenceMatches, varEquals } from '../../../../engine/index.js';

const INVALID_SENDER_LIMIT: Condition = any(
  stepEvidenceMatches('query-pn-delayer-sender-limit-job', 'Invalid sender limit percentage \\['),
  stepEvidenceMatches(
    'query-pn-delayer-sender-limit-job',
    'Invalid senderLimit percentage: job will fail without retry',
  ),
);
const NO_DRIVERS: Condition = stepEvidenceMatches(
  'query-pn-delayer-sender-limit-job',
  'No drivers found for province:\\s*[^\\s"\\\\]+',
);
const DETAILS = [
  ['Servizio', 'pn-delayer'],
  ['Job', 'pn-delayer-sender-limit-job'],
  ['Errore', '{{vars.delayerSenderLimitJobErrorMsg}}'],
  ['Trace ID', '{{vars.delayerSenderLimitJobTraceId}}'],
] as const;
/** The documented failures have different operational outcomes on Monday. */
export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  knownError({
    code: 'SEND_SERVICE_PDSLJEFLA_INV-SEN-LIM-MON',
    description: 'Percentuale sender limit non valida nel job pn-delayer, occorrenza di lunedì',
    condition: all(INVALID_SENDER_LIMIT, varEquals('delayerAlarmIncludesMonday', 'true')),
    title: 'Sender limit non valido: verifica del lunedì',
    resolution:
      'Avvisare il prodotto e verificare la presenza dell\u2019allarme pn-BatchWorkflowStateMachine-FailedAlarm.',
    details: DETAILS,
    level: 'warn',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Percentuale sender limit non valida: il job fallisce senza retry.',
      finalActions: [
        'Avvisare il prodotto',
        'Verificare la presenza dell\u2019allarme pn-BatchWorkflowStateMachine-FailedAlarm',
      ],
      links: [
        {
          url: 'https://pagopaspa.slack.com/archives/C064KJYNLPL/p1790861502607049',
          name: 'Thread Slack 01/10/2026',
          type: 'SLACK',
        },
        {
          url: 'https://pagopaspa.slack.com/archives/C064KJYNLPL/p1790086829253919',
          name: 'Thread Slack 22/09/2026',
          type: 'SLACK',
        },
      ],
    },
  }),
  knownError({
    code: 'SEND_SERVICE_PDSLJEFLA_INV-SEN-LIM-OTH-DAY',
    description: 'Percentuale sender limit non valida nel job pn-delayer, occorrenza non di lunedì',
    condition: all(INVALID_SENDER_LIMIT, varEquals('delayerAlarmIncludesMonday', 'false')),
    title: 'Sender limit non valido: caso noto',
    resolution: 'Se l\u2019allarme non scatta di luned\u00EC, non \u00E8 prevista alcuna azione.',
    details: DETAILS,
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Percentuale sender limit non valida: il job fallisce senza retry.',
      links: [
        {
          url: 'https://pagopaspa.slack.com/archives/C064KJYNLPL/p1790861502607049',
          name: 'Thread Slack 01/10/2026',
          type: 'SLACK',
        },
        {
          url: 'https://pagopaspa.slack.com/archives/C064KJYNLPL/p1790086829253919',
          name: 'Thread Slack 22/09/2026',
          type: 'SLACK',
        },
      ],
      finalActions: [],
    },
  }),
  knownError({
    code: 'SEND_SERVICE_PDSLJEFLA_NO-DRI-MON',
    description: 'Driver assenti per la provincia nel job pn-delayer, occorrenza di lunedì',
    condition: all(NO_DRIVERS, varEquals('delayerAlarmIncludesMonday', 'true')),
    title: 'Driver assenti per la provincia: verifica del lunedì',
    resolution:
      'Avvisare il prodotto e verificare la presenza dell\u2019allarme pn-BatchWorkflowStateMachine-FailedAlarm.',
    details: DETAILS,
    level: 'warn',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Nessun driver trovato per la provincia durante il job pn-delayer sender limit.',
      finalActions: [
        'Avvisare il prodotto',
        'Verificare la presenza dell\u2019allarme pn-BatchWorkflowStateMachine-FailedAlarm',
      ],
      links: [
        {
          url: 'https://pagopaspa.slack.com/archives/C064KJYNLPL/p1790861502607049',
          name: 'Thread Slack 01/10/2026',
          type: 'SLACK',
        },
        {
          url: 'https://pagopaspa.slack.com/archives/C064KJYNLPL/p1790086829253919',
          name: 'Thread Slack 22/09/2026',
          type: 'SLACK',
        },
      ],
    },
  }),
  knownError({
    code: 'SEND_SERVICE_PDSLJEFLA_NO-DRI-OTH-DAY',
    description: 'Driver assenti per la provincia nel job pn-delayer, occorrenza non di lunedì',
    condition: all(NO_DRIVERS, varEquals('delayerAlarmIncludesMonday', 'false')),
    title: 'Driver assenti per la provincia: caso noto',
    resolution: 'Se l\u2019allarme non scatta di luned\u00EC, non \u00E8 prevista alcuna azione.',
    details: DETAILS,
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Nessun driver trovato per la provincia durante il job pn-delayer sender limit.',
      links: [
        {
          url: 'https://pagopaspa.slack.com/archives/C064KJYNLPL/p1790861502607049',
          name: 'Thread Slack 01/10/2026',
          type: 'SLACK',
        },
        {
          url: 'https://pagopaspa.slack.com/archives/C064KJYNLPL/p1790086829253919',
          name: 'Thread Slack 22/09/2026',
          type: 'SLACK',
        },
      ],
      finalActions: [],
    },
  }),
];
