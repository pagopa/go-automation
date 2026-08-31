/**
 * Known cases for the pn-external-registries-OneTrust-downstream-detection-Alarm runbook.
 */

import { SEND_DOWNSTREAMS } from '../framework.js';
import type { KnownCase } from '../framework.js';

const ONE_TRUST_PUBLISHED_VERSION_ENDPOINT =
  'https://app-de.onetrust.com/api/enterprise-policy/v1/privacynotices/{uuid}/published-version';
const ONE_TRUST_TRANSIENT_FAILURE_RESOLUTION =
  'Nessuna azione operativa locale se l’errore è un picco circoscritto; monitorare il downstream One-Trust e attenderne il ripristino.';

/** Known OneTrust failures evaluated against the pn-external-registries downstream query. */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  {
    id: 'onetrust-read-timeout',
    description: '[DOWNSTREAM OneTrust] Timeout di lettura',
    priority: 110,
    condition: {
      type: 'contains',
      ref: 'steps.query-pn-external-registries',
      regex:
        '\\[DOWNSTREAM\\] Service OneTrust returned errors=(?:nested exception is )?' +
        'io\\.netty\\.handler\\.timeout\\.ReadTimeoutException',
    },
    action: {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      message:
        '[CASO NOTO] [DOWNSTREAM OneTrust] Timeout di lettura\n' +
        `Risoluzione: ${ONE_TRUST_TRANSIENT_FAILURE_RESOLUTION}\n` +
        'Servizio: pn-external-registries\n' +
        'Errore: {{vars.externalRegistriesErrorMsg}}\n' +
        'Trace ID: {{vars.externalRegistriesTraceId}}\n',
    },
    analysis: {
      resolution: ONE_TRUST_TRANSIENT_FAILURE_RESOLUTION,
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails: 'ReadTimeoutException durante la comunicazione con il downstream One-Trust.',
      downstreams: [SEND_DOWNSTREAMS.ONE_TRUST],
    },
  },
  {
    id: 'onetrust-service-unavailable-503',
    description: '[DOWNSTREAM OneTrust] Servizio temporaneamente non disponibile (HTTP 503)',
    priority: 100,
    condition: {
      type: 'contains',
      ref: 'steps.query-pn-external-registries',
      regex:
        '\\[DOWNSTREAM\\] Service OneTrust returned errors=503 Service Unavailable from GET ' +
        'https://app-de\\.onetrust\\.com/api/enterprise-policy/v1/privacynotices/[^/\\s"]+/published-version',
    },
    action: {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      message:
        '[CASO NOTO] [DOWNSTREAM OneTrust] Servizio temporaneamente non disponibile (HTTP 503)\n' +
        `Risoluzione: ${ONE_TRUST_TRANSIENT_FAILURE_RESOLUTION}\n` +
        'Servizio: pn-external-registries\n' +
        `Endpoint: ${ONE_TRUST_PUBLISHED_VERSION_ENDPOINT}\n` +
        'Errore: {{vars.externalRegistriesErrorMsg}}\n' +
        'Trace ID: {{vars.externalRegistriesTraceId}}\n',
    },
    analysis: {
      resolution: ONE_TRUST_TRANSIENT_FAILURE_RESOLUTION,
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails: `HTTP 503 Service Unavailable restituito da One-Trust durante la chiamata GET ${ONE_TRUST_PUBLISHED_VERSION_ENDPOINT}.`,
      downstreams: [SEND_DOWNSTREAMS.ONE_TRUST],
    },
  },
];
