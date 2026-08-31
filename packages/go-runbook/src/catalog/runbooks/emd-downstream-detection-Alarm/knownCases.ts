/**
 * Known cases for the emd-downstream-detection-Alarm runbook.
 */

import type { KnownCase } from '../framework.js';
import { SEND_DOWNSTREAMS } from '../framework.js';

import { slackLink } from '../common/analysisLinks.js';

const EMD_SUBMIT_MESSAGE_ENDPOINT = 'https://api-emd.cstar.pagopa.it/emd/message-core/sendMessage';
const EMD_SUBMIT_MESSAGE_UAT_ENDPOINT = 'https://api-emd.uat.cstar.pagopa.it/emd/message-core/sendMessage';
const EMD_RETRIEVAL_ENDPOINT = 'https://api-emd.cstar.pagopa.it/emd/payment/retrievalTokens/{token}';

const EMD_401_INCIDENT_URL = 'https://pagopaspa.slack.com/archives/C087KRMD16E/p1785238197782809';
const EMD_404_REPORT_URL = 'https://pagopaspa.slack.com/archives/C087KRMD16E/p1783325736121109';
const EMD_404_RESOLUTION_URL = 'https://pagopaspa.slack.com/archives/C064KJYNLPL/p1783327442317429';
const EMD_404_DISCUSSION_URL = 'https://pagopaspa.slack.com/archives/C08CLDR962X/p1783334915356509';

const EMD_401_RESOLUTION = 'Contattare il prodotto EMD per verificare l’errore di autorizzazione verso Multicanalità.';
const EMD_500_RESOLUTION =
  'Nessuna azione operativa locale disponibile; monitorare EMD (Multicanalità) e attenderne il ripristino. ' +
  'Se l’errore persiste o presenta numerosità elevata, contattare il prodotto EMD.';
const EMD_404_RESOLUTION =
  'Nessuna azione operativa locale se l’errore è sporadico; se la numerosità è alta, contattare il prodotto EMD.';
const EMD_429_UAT_RESOLUTION =
  'Nessuna azione da intraprendere negli ambienti inferiori; monitorare il rientro del rate limiting.';

/** Known EMD failures evaluated against the generic pn-emd-integration downstream query. */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  {
    id: 'emd-submit-message-unauthorized-401',
    description: '[DOWNSTREAM EMD] Errore di autorizzazione durante submitMessage (HTTP 401)',
    priority: 130,
    condition: {
      type: 'contains',
      ref: 'steps.query-pn-emd-integration',
      regex:
        '\\[DOWNSTREAM\\] Service submitMessage returned errors=401 Unauthorized from POST ' +
        'https://api-emd\\.cstar\\.pagopa\\.it/emd/message-core/sendMessage',
    },
    action: {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      message:
        '[CASO NOTO] [DOWNSTREAM EMD] Errore di autorizzazione durante submitMessage (HTTP 401)\n' +
        `Risoluzione: ${EMD_401_RESOLUTION}\n` +
        'Servizio: pn-emd-integration\n' +
        `Endpoint: ${EMD_SUBMIT_MESSAGE_ENDPOINT}\n` +
        'Errore: {{vars.emdIntegrationErrorMsg}}\n' +
        'Trace ID: {{vars.emdIntegrationTraceId}}\n',
    },
    analysis: {
      resolution: EMD_401_RESOLUTION,
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails: `HTTP 401 Unauthorized restituito da EMD durante la chiamata POST ${EMD_SUBMIT_MESSAGE_ENDPOINT}.`,
      downstreams: [SEND_DOWNSTREAMS.EMD_MULTICANALITA],
      finalActions: ['Contattare il prodotto EMD'],
      links: [slackLink(EMD_401_INCIDENT_URL, 'Thread Slack EMD HTTP 401')],
    },
  },
  {
    id: 'emd-submit-message-internal-server-error-500',
    description: '[DOWNSTREAM EMD] Errore interno durante submitMessage (HTTP 500)',
    priority: 120,
    condition: {
      type: 'contains',
      ref: 'steps.query-pn-emd-integration',
      regex:
        '\\[DOWNSTREAM\\] Service submitMessage returned errors=500 Internal Server Error from POST ' +
        'https://api-emd\\.cstar\\.pagopa\\.it/emd/message-core/sendMessage',
    },
    action: {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      message:
        '[CASO NOTO] [DOWNSTREAM EMD] Errore interno durante submitMessage (HTTP 500)\n' +
        `Risoluzione: ${EMD_500_RESOLUTION}\n` +
        'Servizio: pn-emd-integration\n' +
        `Endpoint: ${EMD_SUBMIT_MESSAGE_ENDPOINT}\n` +
        'Errore: {{vars.emdIntegrationErrorMsg}}\n' +
        'Trace ID: {{vars.emdIntegrationTraceId}}\n',
    },
    analysis: {
      resolution: EMD_500_RESOLUTION,
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails:
        `HTTP 500 restituito da EMD durante la chiamata POST ${EMD_SUBMIT_MESSAGE_ENDPOINT}; ` +
        'il servizio registra PN_EMD_INTEGRATION_SEND_MESSAGE_ERROR.',
      downstreams: [SEND_DOWNSTREAMS.EMD_MULTICANALITA],
      finalActions: ['Contattare il prodotto EMD se l’errore persiste o presenta numerosità elevata'],
    },
  },
  {
    id: 'emd-retrieval-payload-not-found-or-expired-404',
    description: '[DOWNSTREAM EMD] Retrieval payload non trovato o scaduto (HTTP 404)',
    priority: 110,
    condition: {
      type: 'contains',
      ref: 'steps.query-pn-emd-integration',
      regex:
        '\\[DOWNSTREAM\\] Service getRetrieval returned errors=404 Not Found from GET ' +
        'https://api-emd\\.cstar\\.pagopa\\.it/emd/payment/retrievalTokens/[^\\s"]+',
    },
    action: {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      message:
        '[CASO NOTO] [DOWNSTREAM EMD] Retrieval payload non trovato o scaduto (HTTP 404)\n' +
        `Risoluzione: ${EMD_404_RESOLUTION}\n` +
        'Servizio: pn-emd-integration\n' +
        `Endpoint: ${EMD_RETRIEVAL_ENDPOINT}\n` +
        'Errore: {{vars.emdIntegrationErrorMsg}}\n' +
        'Trace ID: {{vars.emdIntegrationTraceId}}\n',
    },
    analysis: {
      resolution: EMD_404_RESOLUTION,
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails:
        'HTTP 404 restituito da getRetrieval perché il retrieval payload non è stato trovato o è scaduto; ' +
        'il servizio registra PN_EMD_INTEGRATION_RETRIEVAL_PAYLOAD_MISSING_OR_EXPIRED.',
      downstreams: [SEND_DOWNSTREAMS.EMD_MULTICANALITA],
      finalActions: ['Contattare il prodotto EMD se la numerosità è alta'],
      links: [
        slackLink(EMD_404_REPORT_URL, 'Segnalazione Slack EMD HTTP 404'),
        slackLink(EMD_404_RESOLUTION_URL, 'Risoluzione Slack EMD HTTP 404'),
        slackLink(EMD_404_DISCUSSION_URL, 'Discussione team EMD HTTP 404'),
      ],
    },
  },
  {
    id: 'emd-submit-message-too-many-requests-429-uat',
    description: '[DOWNSTREAM EMD] Rate limiting durante submitMessage in UAT (HTTP 429)',
    priority: 100,
    condition: {
      type: 'contains',
      ref: 'steps.query-pn-emd-integration',
      regex:
        '\\[DOWNSTREAM\\] Service submitMessage returned errors=429 Too Many Requests from POST ' +
        'https://api-emd\\.uat\\.cstar\\.pagopa\\.it/emd/message-core/sendMessage',
    },
    action: {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      message:
        '[CASO NOTO] [DOWNSTREAM EMD] Rate limiting durante submitMessage in UAT (HTTP 429)\n' +
        `Risoluzione: ${EMD_429_UAT_RESOLUTION}\n` +
        'Servizio: pn-emd-integration\n' +
        `Endpoint: ${EMD_SUBMIT_MESSAGE_UAT_ENDPOINT}\n` +
        'Errore: {{vars.emdIntegrationErrorMsg}}\n' +
        'Trace ID: {{vars.emdIntegrationTraceId}}\n',
    },
    analysis: {
      resolution: EMD_429_UAT_RESOLUTION,
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails: `HTTP 429 restituito dall’endpoint UAT di EMD durante la chiamata POST ${EMD_SUBMIT_MESSAGE_UAT_ENDPOINT}.`,
      downstreams: [SEND_DOWNSTREAMS.EMD_MULTICANALITA],
    },
  },
];
