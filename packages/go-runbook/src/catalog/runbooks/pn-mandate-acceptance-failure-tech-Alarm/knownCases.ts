/**
 * Known cases for the pn-mandate-acceptance-failure-tech-Alarm runbook.
 */

import { knownCase, SEND_DOWNSTREAMS } from '../framework.js';
import type { KnownCase } from '../framework.js';

import { slackLink } from '../common/analysisLinks.js';
import { all } from '../common/conditions.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';

const INCIDENT_THREAD_25_AUGUST_2026 = 'https://pagopaspa.slack.com/archives/C064KJYNLPL/p1787668559252499';
const INCIDENT_THREAD_28_AUGUST_2026 =
  'https://pagopaspa.slack.com/archives/C064KJYNLPL/p1787920661578489?thread_ts=1787668559.252499&cid=C064KJYNLPL';

const UNDOCUMENTED_RESOLUTION =
  'La pagina Confluence non indica una risoluzione operativa. Mantenere l’analisi aperta e condividere ' +
  'trace_id, errore completo e campo mancante con i referenti Andrea Bertucci o Marco Iannaccone.';

/** The single known case documented by the source page, including its two observed field variants. */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'cie-nis-data-missing-values',
    description: 'Accettazione delega CIE fallita per dati NIS mancanti',
    priority: 100,
    condition: all(
      stepEvidenceMatches('query-pn-mandate', 'AUD_DL_ACCEPT\\]\\s+FAILURE\\s+-\\s+CIE Data missing values'),
      stepEvidenceMatches('query-pn-mandate-trace', 'PN_MANDATE_BADREQUEST'),
      stepEvidenceMatches('query-pn-mandate-trace', 'Missing or empty field:\\s*nisData\\.(?:pub_key|sod)'),
    ),
    title: 'Accettazione delega CIE: dati NIS mancanti',
    resolution: UNDOCUMENTED_RESOLUTION,
    level: 'warn',
    details: [
      ['Servizio', 'pn-mandate'],
      ['Workflow', 'CIE'],
      ['Categoria errore', 'TECH'],
      ['Errore', '{{vars.mandateErrorMsg}}'],
      ['Trace ID', '{{vars.mandateTraceId}}'],
      ['Campi documentati', 'nisData.pub_key oppure nisData.sod'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails:
        'Errore HTTP 400 PN_MANDATE_BADREQUEST: nei casi documentati manca nisData.pub_key oppure nisData.sod durante l’accettazione CIE.',
      downstreams: [SEND_DOWNSTREAMS.NESSUNO],
      finalActions: ['Condividere trace_id, errore completo e campo mancante con Andrea Bertucci o Marco Iannaccone'],
      links: [
        slackLink(INCIDENT_THREAD_25_AUGUST_2026, 'Thread Slack del 25/08/2026'),
        slackLink(INCIDENT_THREAD_28_AUGUST_2026, 'Thread Slack del 28/08/2026'),
      ],
    },
  }),
];
