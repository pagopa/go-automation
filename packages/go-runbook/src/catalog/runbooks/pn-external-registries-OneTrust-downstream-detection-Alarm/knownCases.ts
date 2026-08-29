/**
 * Known cases for the pn-external-registries-OneTrust-downstream-detection-Alarm runbook.
 */

import { SEND_DOWNSTREAMS } from '../framework.js';
import { knownCase } from '../framework.js';
import type { KnownCase } from '../framework.js';

const ONE_TRUST_PUBLISHED_VERSION_ENDPOINT =
  'https://app-de.onetrust.com/api/enterprise-policy/v1/privacynotices/{uuid}/published-version';
const ONE_TRUST_TRANSIENT_FAILURE_RESOLUTION =
  'Nessuna azione operativa locale se l’errore è un picco circoscritto; monitorare il downstream One-Trust e attenderne il ripristino.';

/** Known OneTrust failures evaluated against the pn-external-registries downstream query. */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
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
    resolution: ONE_TRUST_TRANSIENT_FAILURE_RESOLUTION,
    details: [
      ['Servizio', 'pn-external-registries'],
      ['Errore', '{{vars.externalRegistriesErrorMsg}}'],
      ['Trace ID', '{{vars.externalRegistriesTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails: 'ReadTimeoutException durante la comunicazione con il downstream One-Trust.',
      downstreams: [SEND_DOWNSTREAMS.ONE_TRUST],
    },
  }),
  knownCase({
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
    resolution: ONE_TRUST_TRANSIENT_FAILURE_RESOLUTION,
    details: [
      ['Servizio', 'pn-external-registries'],
      ['Endpoint', ONE_TRUST_PUBLISHED_VERSION_ENDPOINT],
      ['Errore', '{{vars.externalRegistriesErrorMsg}}'],
      ['Trace ID', '{{vars.externalRegistriesTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails: `HTTP 503 Service Unavailable restituito da One-Trust durante la chiamata GET ${ONE_TRUST_PUBLISHED_VERSION_ENDPOINT}.`,
      downstreams: [SEND_DOWNSTREAMS.ONE_TRUST],
    },
  }),
];
