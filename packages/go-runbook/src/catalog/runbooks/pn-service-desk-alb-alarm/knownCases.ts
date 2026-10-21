import { knownCase } from '../framework.js';
import type { KnownCase } from '../framework.js';
import { anyStepEvidenceMatches } from '../common/evidenceConditions.js';

const QUERY_STEPS = ['query-pn-service-desk', 'query-pn-service-desk-trace'];
const SLACK_REFERENCE = {
  url: 'https://pagopaspa.slack.com/archives/C087KRMD16E/p1777038922083169',
  name: 'Thread Slack 24/04/2026',
  type: 'SLACK' as const,
};

/** Confluence v1/v2 and complete core log queries from 28 September and 8 October 2026. */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'service-desk-view-notification-not-found',
    description: '[AUD_CA_VIEW_NOTIFICATION] Notifica non trovata (HTTP 404)',
    priority: 100,
    condition: anyStepEvidenceMatches(
      QUERY_STEPS,
      String.raw`\[AUD_CA_VIEW_NOTIFICATION\] FAILURE - errorReason = 404 Not Found from GET http://[^\s"\\/]+/delivery-private/notifications/[^\s"\\/,]+, An error occurred while calling the service to obtain sent notifications`,
    ),
    resolution: 'Risoluzione non documentata. Riferimento: thread Slack del 24/04/2026.',
    details: [
      ['Servizio', 'pn-service-desk'],
      ['Errore', '404 Not Found durante la consultazione di una notifica'],
      ['Trace ID', '{{vars.serviceDeskTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails:
        'HTTP 404 sulla richiesta GET /delivery-private/notifications/<IUN>, con firma AUD_CA_VIEW_NOTIFICATION.',
      links: [SLACK_REFERENCE],
    },
  }),
  knownCase({
    id: 'service-desk-notification-document-gone',
    description: 'Recupero documento di notifica: HTTP 410 Gone',
    priority: 90,
    condition: anyStepEvidenceMatches(
      QUERY_STEPS,
      String.raw`errorReason = 410 Gone from GET http://[^\s"\\/]+/delivery-private/notifications/received/[^\s"\\/,]+/attachments/documents/\d+, An error occurred while calling the service to obtain notification document`,
    ),
    resolution: 'Risoluzione non documentata.',
    details: [
      ['Servizio', 'pn-service-desk'],
      ['Errore', '410 Gone durante il recupero del documento di notifica'],
      ['Trace ID', '{{vars.serviceDeskTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'HTTP 410 sul GET /delivery-private/notifications/received/<IUN>/attachments/documents/<indice>.',
    },
  }),
];
