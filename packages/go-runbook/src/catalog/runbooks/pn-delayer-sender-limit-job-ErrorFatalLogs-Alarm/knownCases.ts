import { knownCase } from '../framework.js';
import type { Condition, KnownCase } from '../framework.js';

import { slackLink } from '../common/analysisLinks.js';
import { all, any } from '../common/conditions.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';
import { varEquals } from '../common/varConditions.js';


const INCIDENT_THREAD_22_SEPTEMBER_2026 = 'https://pagopaspa.slack.com/archives/C064KJYNLPL/p1790086829253919';
const INCIDENT_THREAD_01_OCTOBER_2026 = 'https://pagopaspa.slack.com/archives/C064KJYNLPL/p1790861502607049';
const INCIDENT_LINKS = [
  slackLink(INCIDENT_THREAD_01_OCTOBER_2026, 'Thread Slack 01/10/2026'),
  slackLink(INCIDENT_THREAD_22_SEPTEMBER_2026, 'Thread Slack 22/09/2026'),
];
const MONDAY_RESOLUTION =
  'Avvisare il prodotto e verificare la presenza dell’allarme pn-BatchWorkflowStateMachine-FailedAlarm. ' +
  'Mantenere aperta l’analisi finché entrambe le verifiche non sono concluse.';
const MONDAY_FINAL_ACTIONS = [
  'Avvisare il prodotto',
  'Verificare la presenza dell’allarme pn-BatchWorkflowStateMachine-FailedAlarm',
];
const OTHER_DAY_RESOLUTION = 'Caso noto. Fuori dal lunedì la pagina operativa non richiede alcuna azione.';

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
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'invalid-sender-limit-monday',
    description: 'Percentuale sender limit non valida nel job pn-delayer, occorrenza di lunedì',
    priority: 110,
    condition: all(INVALID_SENDER_LIMIT, varEquals('delayerAlarmIncludesMonday', 'true')),
    title: 'Sender limit non valido: verifica del lunedì',
    resolution: MONDAY_RESOLUTION,
    details: DETAILS,
    level: 'warn',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Percentuale sender limit non valida: il job fallisce senza retry.',
      finalActions: MONDAY_FINAL_ACTIONS,
      links: INCIDENT_LINKS,
    },
  }),
  knownCase({
    id: 'invalid-sender-limit-other-day',
    description: 'Percentuale sender limit non valida nel job pn-delayer, occorrenza non di lunedì',
    priority: 100,
    condition: all(INVALID_SENDER_LIMIT, varEquals('delayerAlarmIncludesMonday', 'false')),
    title: 'Sender limit non valido: caso noto',
    resolution: OTHER_DAY_RESOLUTION,
    details: DETAILS,
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Percentuale sender limit non valida: il job fallisce senza retry.',
      links: INCIDENT_LINKS,
    },
  }),
  knownCase({
    id: 'no-drivers-monday',
    description: 'Driver assenti per la provincia nel job pn-delayer, occorrenza di lunedì',
    priority: 130,
    condition: all(NO_DRIVERS, varEquals('delayerAlarmIncludesMonday', 'true')),
    title: 'Driver assenti per la provincia: verifica del lunedì',
    resolution: MONDAY_RESOLUTION,
    details: DETAILS,
    level: 'warn',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Nessun driver trovato per la provincia durante il job pn-delayer sender limit.',
      finalActions: MONDAY_FINAL_ACTIONS,
      links: INCIDENT_LINKS,
    },
  }),
  knownCase({
    id: 'no-drivers-other-day',
    description: 'Driver assenti per la provincia nel job pn-delayer, occorrenza non di lunedì',
    priority: 120,
    condition: all(NO_DRIVERS, varEquals('delayerAlarmIncludesMonday', 'false')),
    title: 'Driver assenti per la provincia: caso noto',
    resolution: OTHER_DAY_RESOLUTION,
    details: DETAILS,
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Nessun driver trovato per la provincia durante il job pn-delayer sender limit.',
      links: INCIDENT_LINKS,
    },
  }),
];
