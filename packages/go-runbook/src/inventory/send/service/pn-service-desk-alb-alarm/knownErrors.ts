import { knownError } from '../../../../toolkits/send/index.js';
import { anyStepEvidenceMatches, type KnownError } from '../../../../engine/index.js';

const QUERY_STEPS = ['query-pn-service-desk', 'query-pn-service-desk-trace'];
const SLACK_REFERENCE = {
  url: 'https://pagopaspa.slack.com/archives/C087KRMD16E/p1777038922083169',
  name: 'Thread Slack 24/04/2026',
  type: 'SLACK' as const,
};

/** Confluence v1/v2 and complete core log queries from 28 September and 8 October 2026. */
export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  knownError({
    code: 'SEND_SERVICE_PSDAA_SER-DES-VIE-NOT-NOT-FOU',
    description: '[AUD_CA_VIEW_NOTIFICATION] Notifica non trovata (HTTP 404)',
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
  knownError({
    code: 'SEND_SERVICE_PSDAA_SER-DES-NOT-DOC-GON',
    description: 'Recupero documento di notifica: HTTP 410 Gone',
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
