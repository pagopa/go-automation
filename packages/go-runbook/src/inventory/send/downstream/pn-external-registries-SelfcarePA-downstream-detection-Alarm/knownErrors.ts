import { downstreamMarkerPattern, knownError, SEND_DOWNSTREAMS } from '../../../../toolkits/send/index.js';
import { type KnownError, stepEvidenceMatches } from '../../../../engine/index.js';

/** Sources: Confluence 3414851586 v1; CloudWatch occurrences of 2026-09-01 and 2026-06-04. */
export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  knownError({
    code: 'SEND_DOWNSTREAM_PERSPADDA_SEL-PA-INV-TEN-CON',
    description: '[DOWNSTREAM SelfcarePA] HTTP 400: Invalid tenant context',
    condition: {
      type: 'and',
      conditions: [
        stepEvidenceMatches(
          'query-pn-external-registries',
          `${downstreamMarkerPattern('SelfcarePA', {
            status: '400 Bad Request',
            method: 'GET',
            endpoint: 'https://api.selfcare.pagopa.it/external/v2/user-groups',
          })};[^\\r\\n]*Invalid tenant context\\b`,
        ),
      ],
    },
    resolution: 'Risoluzione non documentata.',
    level: 'warn',
    details: [
      ['Servizio', 'pn-external-registries'],
      ['Errore', '{{vars.externalRegistriesErrorMsg}}'],
      ['Trace ID', '{{vars.externalRegistriesTraceId}}'],
      ['Log applicativi', '{{vars.externalRegistriesLogCount}}'],
      ['Log del trace', '{{vars.externalRegistriesTraceLogCount}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      downstreams: [SEND_DOWNSTREAMS.SELFCARE],
      finalActions: [],
      links: [],
    },
  }),
  knownError({
    code: 'SEND_DOWNSTREAM_PERSPADDA_SEL-PA-USE-GRO-RAT-TOO-LAR',
    description: '[DOWNSTREAM SelfcarePA] HTTP 500 con RequestRateTooLarge nella risposta',
    condition: {
      type: 'and',
      conditions: [
        stepEvidenceMatches(
          'query-pn-external-registries',
          `${downstreamMarkerPattern('SelfcarePA', {
            status: '500 Internal Server Error',
            method: 'GET',
            endpoint: 'https://api.selfcare.pagopa.it/external/v2/user-groups',
          })};[^\\r\\n]*RequestRateTooLarge\\b[^\\r\\n]*TooManyRequests \\(429\\)`,
        ),
      ],
    },
    resolution: 'Risoluzione non documentata.',
    level: 'warn',
    details: [
      ['Servizio', 'pn-external-registries'],
      ['Errore', '{{vars.externalRegistriesErrorMsg}}'],
      ['Trace ID', '{{vars.externalRegistriesTraceId}}'],
      ['Log applicativi', '{{vars.externalRegistriesLogCount}}'],
      ['Log del trace', '{{vars.externalRegistriesTraceLogCount}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      downstreams: [SEND_DOWNSTREAMS.SELFCARE],
      finalActions: [],
      links: [],
    },
  }),
  knownError({
    code: 'SEND_DOWNSTREAM_PERSPADDA_SEL-PA-REA-TIM',
    description: '[DOWNSTREAM SelfcarePA] Timeout di lettura',
    condition: {
      type: 'and',
      conditions: [
        stepEvidenceMatches(
          'query-pn-external-registries',
          `${downstreamMarkerPattern('SelfcarePA')}io\\.netty\\.handler\\.timeout\\.ReadTimeoutException\\b`,
        ),
      ],
    },
    resolution:
      'Risoluzione non documentata. Se il problema si protrae nel tempo, segnalarlo al team di infrastruttura per valutare la possibilità di aprire una segnalazione. Vedi Runbook downstream per i riferimenti.',
    level: 'warn',
    details: [
      ['Servizio', 'pn-external-registries'],
      ['Errore', '{{vars.externalRegistriesErrorMsg}}'],
      ['Trace ID', '{{vars.externalRegistriesTraceId}}'],
      ['Log applicativi', '{{vars.externalRegistriesLogCount}}'],
      ['Log del trace', '{{vars.externalRegistriesTraceLogCount}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      downstreams: [SEND_DOWNSTREAMS.SELFCARE],
      finalActions: [],
      links: [],
    },
  }),
];
