/**
 * Known cases for the emd-downstream-detection-Alarm runbook.
 */
import type { KnownCase } from '../framework.js';
import { knownCase } from '../framework.js';
import { SEND_DOWNSTREAMS } from '../framework.js';

import { stepEvidenceMatches } from '../common/evidenceConditions.js';
const EMD_SUBMIT_MESSAGE_ENDPOINT = 'https://api-emd.cstar.pagopa.it/emd/message-core/sendMessage';
const EMD_SUBMIT_MESSAGE_UAT_ENDPOINT = 'https://api-emd.uat.cstar.pagopa.it/emd/message-core/sendMessage';
const EMD_RETRIEVAL_ENDPOINT = 'https://api-emd.cstar.pagopa.it/emd/payment/retrievalTokens/{token}';
/** Known EMD failures evaluated against the generic pn-emd-integration downstream query. */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'emd-submit-message-unauthorized-401',
    description: '[DOWNSTREAM EMD] Errore di autorizzazione durante submitMessage (HTTP 401)',
    priority: 130,
    condition: stepEvidenceMatches(
      'query-pn-emd-integration',
      '\\[DOWNSTREAM\\] Service submitMessage returned errors=401 Unauthorized from POST ' +
        'https://api-emd\\.cstar\\.pagopa\\.it/emd/message-core/sendMessage',
    ),
    resolution: 'Contattare il prodotto EMD.',
    details: [
      ['Servizio', 'pn-emd-integration'],
      ['Endpoint', EMD_SUBMIT_MESSAGE_ENDPOINT],
      ['Errore', '{{vars.emdIntegrationErrorMsg}}'],
      ['Trace ID', '{{vars.emdIntegrationTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails: `HTTP 401 Unauthorized restituito da EMD durante la chiamata POST ${EMD_SUBMIT_MESSAGE_ENDPOINT}.`,
      downstreams: [SEND_DOWNSTREAMS.EMD_MULTICANALITA],
      finalActions: [],
      links: [
        {
          url: 'https://pagopaspa.slack.com/archives/C087KRMD16E/p1785238197782809',
          name: 'Thread Slack EMD HTTP 401',
          type: 'SLACK',
        },
      ],
    },
  }),
  knownCase({
    id: 'emd-submit-message-internal-server-error-500',
    description: '[DOWNSTREAM EMD] Errore interno durante submitMessage (HTTP 500)',
    priority: 120,
    condition: stepEvidenceMatches(
      'query-pn-emd-integration',
      '\\[DOWNSTREAM\\] Service submitMessage returned errors=500 Internal Server Error from POST ' +
        'https://api-emd\\.cstar\\.pagopa\\.it/emd/message-core/sendMessage',
    ),
    resolution: 'Risoluzione non documentata.',
    details: [
      ['Servizio', 'pn-emd-integration'],
      ['Endpoint', EMD_SUBMIT_MESSAGE_ENDPOINT],
      ['Errore', '{{vars.emdIntegrationErrorMsg}}'],
      ['Trace ID', '{{vars.emdIntegrationTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails:
        `HTTP 500 restituito da EMD durante la chiamata POST ${EMD_SUBMIT_MESSAGE_ENDPOINT}; ` +
        'il servizio registra PN_EMD_INTEGRATION_SEND_MESSAGE_ERROR.',
      downstreams: [SEND_DOWNSTREAMS.EMD_MULTICANALITA],
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'emd-retrieval-payload-not-found-or-expired-404',
    description: '[DOWNSTREAM EMD] Retrieval payload non trovato o scaduto (HTTP 404)',
    priority: 110,
    condition: stepEvidenceMatches(
      'query-pn-emd-integration',
      '\\[DOWNSTREAM\\] Service getRetrieval returned errors=404 Not Found from GET ' +
        'https://api-emd\\.cstar\\.pagopa\\.it/emd/payment/retrievalTokens/[^\\s"]+',
    ),
    resolution: 'Se la numerosit\u00E0 degli errori \u00E8 elevata, contattare il prodotto EMD.',
    details: [
      ['Servizio', 'pn-emd-integration'],
      ['Endpoint', EMD_RETRIEVAL_ENDPOINT],
      ['Errore', '{{vars.emdIntegrationErrorMsg}}'],
      ['Trace ID', '{{vars.emdIntegrationTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails:
        'HTTP 404 restituito da getRetrieval perché il retrieval payload non è stato trovato o è scaduto; ' +
        'il servizio registra PN_EMD_INTEGRATION_RETRIEVAL_PAYLOAD_MISSING_OR_EXPIRED.',
      downstreams: [SEND_DOWNSTREAMS.EMD_MULTICANALITA],
      finalActions: [],
      links: [
        {
          url: 'https://pagopaspa.slack.com/archives/C087KRMD16E/p1783325736121109',
          name: 'Segnalazione Slack EMD HTTP 404',
          type: 'SLACK',
        },
        {
          url: 'https://pagopaspa.slack.com/archives/C064KJYNLPL/p1783327442317429',
          name: 'Risoluzione Slack EMD HTTP 404',
          type: 'SLACK',
        },
        {
          url: 'https://pagopaspa.slack.com/archives/C08CLDR962X/p1783334915356509',
          name: 'Discussione team EMD HTTP 404',
          type: 'SLACK',
        },
      ],
    },
  }),
  knownCase({
    id: 'emd-submit-message-too-many-requests-429-uat',
    description: '[DOWNSTREAM EMD] Rate limiting durante submitMessage in UAT (HTTP 429)',
    priority: 100,
    condition: stepEvidenceMatches(
      'query-pn-emd-integration',
      '\\[DOWNSTREAM\\] Service submitMessage returned errors=429 Too Many Requests from POST ' +
        'https://api-emd\\.uat\\.cstar\\.pagopa\\.it/emd/message-core/sendMessage',
    ),
    resolution: 'Nessuna azione da intraprendere negli ambienti inferiori.',
    details: [
      ['Servizio', 'pn-emd-integration'],
      ['Endpoint', EMD_SUBMIT_MESSAGE_UAT_ENDPOINT],
      ['Errore', '{{vars.emdIntegrationErrorMsg}}'],
      ['Trace ID', '{{vars.emdIntegrationTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails: `HTTP 429 restituito dall’endpoint UAT di EMD durante la chiamata POST ${EMD_SUBMIT_MESSAGE_UAT_ENDPOINT}.`,
      downstreams: [SEND_DOWNSTREAMS.EMD_MULTICANALITA],
      finalActions: [],
      links: [],
    },
  }),
];
