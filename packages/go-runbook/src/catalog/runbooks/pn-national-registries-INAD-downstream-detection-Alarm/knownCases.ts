/**
 * Known cases for the pn-national-registries-INAD-downstream-detection-Alarm runbook.
 */

import { SEND_DOWNSTREAMS } from '../framework.js';
import type { KnownCase } from '../framework.js';

const INAD_DIGITAL_DOMICILE_ENDPOINT =
  'https://api.inad.gov.it/rest/inad/v1/domiciliodigitale/extract/{codiceFiscale}';
const ANALYSIS_COMPLETED_FINAL_ACTION =
  'Analisi conclusa in autonomia dal team di GO. Non è necessario altro confronto';
const INAD_RECOVERY_RESOLUTION =
  'Monitorare il downstream INAD e attenderne il ripristino; nel caso censito il servizio è rientrato al polling ' +
  'successivo senza ulteriori azioni.';

/** Known INAD failures evaluated against the pn-national-registries downstream query. */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  {
    id: 'inad-digital-domicile-internal-server-error-500',
    description: '[DOWNSTREAM INAD] HTTP 500 durante il recupero del domicilio digitale',
    priority: 130,
    condition: {
      type: 'contains',
      ref: 'steps.query-pn-national-registries',
      regex:
        '\\[DOWNSTREAM\\] Service INAD returned errors=500 Internal Server Error from GET ' +
        'https://api\\.inad\\.gov\\.it/rest/inad/v1/domiciliodigitale/extract/[^\\s"]+',
    },
    action: {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      message:
        '[CASO NOTO] [DOWNSTREAM INAD] HTTP 500 durante il recupero del domicilio digitale\n' +
        `Risoluzione: ${INAD_RECOVERY_RESOLUTION}\n` +
        'Servizio: pn-national-registries\n' +
        `Endpoint: ${INAD_DIGITAL_DOMICILE_ENDPOINT}\n` +
        'Errore: {{vars.nationalRegistriesErrorMsg}}\n' +
        'Trace ID: {{vars.nationalRegistriesTraceId}}\n',
    },
    analysis: {
      resolution: INAD_RECOVERY_RESOLUTION,
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails: `HTTP 500 restituito da INAD durante la chiamata GET ${INAD_DIGITAL_DOMICILE_ENDPOINT}.`,
      downstreams: [SEND_DOWNSTREAMS.INAD],
      finalActions: [ANALYSIS_COMPLETED_FINAL_ACTION],
    },
  },
  {
    id: 'inad-connection-reset-by-peer',
    description: '[DOWNSTREAM INAD] Connessione chiusa dal downstream',
    priority: 120,
    condition: {
      type: 'contains',
      ref: 'steps.query-pn-national-registries',
      regex:
        '\\[DOWNSTREAM\\] Service INAD returned errors=recvAddress\\(\\.\\.\\) failed: ' +
        'Connection reset by peer',
    },
    action: {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      message:
        '[CASO NOTO] [DOWNSTREAM INAD] Connessione chiusa dal downstream\n' +
        `Risoluzione: ${INAD_RECOVERY_RESOLUTION}\n` +
        'Servizio: pn-national-registries\n' +
        'Endpoint: api.inad.gov.it\n' +
        'Errore: {{vars.nationalRegistriesErrorMsg}}\n' +
        'Trace ID: {{vars.nationalRegistriesTraceId}}\n',
    },
    analysis: {
      resolution: INAD_RECOVERY_RESOLUTION,
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Connessione verso INAD interrotta dal peer remoto durante la ricezione.',
      downstreams: [SEND_DOWNSTREAMS.INAD],
      finalActions: [ANALYSIS_COMPLETED_FINAL_ACTION],
    },
  },
  {
    id: 'inad-connect-timeout',
    description: '[DOWNSTREAM INAD] Timeout di connessione',
    priority: 110,
    condition: {
      type: 'contains',
      ref: 'steps.query-pn-national-registries',
      regex:
        '\\[DOWNSTREAM\\] Service INAD returned errors=connection timed out after \\d+ ms: ' +
        'api\\.inad\\.gov\\.it/[^\\s"]+:443',
    },
    action: {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      message:
        '[CASO NOTO] [DOWNSTREAM INAD] Timeout di connessione\n' +
        `Risoluzione: ${INAD_RECOVERY_RESOLUTION}\n` +
        'Servizio: pn-national-registries\n' +
        'Endpoint: api.inad.gov.it:443\n' +
        'Errore: {{vars.nationalRegistriesErrorMsg}}\n' +
        'Trace ID: {{vars.nationalRegistriesTraceId}}\n',
    },
    analysis: {
      resolution: INAD_RECOVERY_RESOLUTION,
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Connessione TLS verso api.inad.gov.it:443 scaduta prima di essere stabilita.',
      downstreams: [SEND_DOWNSTREAMS.INAD],
      finalActions: [ANALYSIS_COMPLETED_FINAL_ACTION],
    },
  },
  {
    id: 'inad-service-unavailable-503',
    description: '[DOWNSTREAM INAD] Servizio temporaneamente non disponibile (HTTP 503)',
    priority: 100,
    condition: {
      type: 'contains',
      ref: 'steps.query-pn-national-registries',
      regex: '\\[DOWNSTREAM\\] Service INAD returned errors=503 Service Unavailable',
    },
    action: {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      message:
        '[CASO NOTO] [DOWNSTREAM INAD] Servizio non disponibile (HTTP 503)\n' +
        `Risoluzione: ${INAD_RECOVERY_RESOLUTION}\n` +
        'Servizio: pn-national-registries\n' +
        'Errore: {{vars.nationalRegistriesErrorMsg}}\n' +
        'Trace ID: {{vars.nationalRegistriesTraceId}}\n',
    },
    analysis: {
      resolution: INAD_RECOVERY_RESOLUTION,
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails: 'HTTP 503 Service Unavailable restituito dal downstream INAD.',
      downstreams: [SEND_DOWNSTREAMS.INAD],
      finalActions: [ANALYSIS_COMPLETED_FINAL_ACTION],
    },
  },
];
