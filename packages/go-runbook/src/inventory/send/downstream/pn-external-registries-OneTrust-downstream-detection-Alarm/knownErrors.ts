/**
 * Known errors for the pn-external-registries-OneTrust-downstream-detection-Alarm runbook.
 */
import { downstreamMarkerPattern, knownError, SEND_DOWNSTREAMS } from '../../../../toolkits/send/index.js';
import { type KnownError, stepEvidenceMatches } from '../../../../engine/index.js';
const ONE_TRUST_PUBLISHED_VERSION_ENDPOINT =
  'https://app-de.onetrust.com/api/enterprise-policy/v1/privacynotices/{uuid}/published-version';
/** Known OneTrust failures evaluated against the pn-external-registries downstream query. */
export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  knownError({
    code: 'SEND_DOWNSTREAM_PEROTDDA_ONE-REA-TIM',
    description: '[DOWNSTREAM OneTrust] Timeout di lettura',
    condition: stepEvidenceMatches(
      'query-pn-external-registries',
      `${downstreamMarkerPattern(
        'OneTrust',
      )}(?:nested exception is )?io\\.netty\\.handler\\.timeout\\.ReadTimeoutException`,
    ),
    resolution:
      'Nessuna azione necessaria qualora sia solo un picco circoscritto in un intervallo di tempo limitato. Si tratterebbe di un disservizio momentaneo.',
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
      finalActions: [],
      links: [],
    },
  }),
  knownError({
    code: 'SEND_DOWNSTREAM_PEROTDDA_ONE-SER-UNA-503',
    description: '[DOWNSTREAM OneTrust] Servizio temporaneamente non disponibile (HTTP 503)',
    condition: stepEvidenceMatches(
      'query-pn-external-registries',
      `${downstreamMarkerPattern('OneTrust', {
        status: '503 Service Unavailable',
        method: 'GET',
        endpoint: 'https://app-de.onetrust.com/api/enterprise-policy/v1/privacynotices/',
      })}[^/\\s"]+/published-version`,
    ),
    resolution:
      'Nessuna azione necessaria qualora sia solo un picco circoscritto in un intervallo di tempo limitato. Si tratterebbe di un disservizio momentaneo.',
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
      finalActions: [],
      links: [],
    },
  }),
];
