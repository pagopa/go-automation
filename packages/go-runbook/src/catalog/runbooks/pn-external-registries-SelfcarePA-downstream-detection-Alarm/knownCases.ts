import { knownCase, SEND_DOWNSTREAMS, type KnownCase } from '../framework.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';

/** Sources: Confluence 3414851586 v1; CloudWatch occurrences of 2026-09-01 and 2026-06-04. */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'selfcare-pa-invalid-tenant-context',
    description: '[DOWNSTREAM SelfcarePA] HTTP 400: Invalid tenant context',
    priority: 120,
    condition: {
      type: 'and',
      conditions: [
        { type: 'exists', ref: 'vars.externalRegistriesTraceLogCount' },
        stepEvidenceMatches(
          'query-pn-external-registries',
          '\\[DOWNSTREAM\\] Service SelfcarePA returned errors=400 Bad Request from GET ' +
            'https://api\\.selfcare\\.pagopa\\.it/external/v2/user-groups;' +
            '[^\\r\\n]*Invalid tenant context\\b',
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
  knownCase({
    id: 'selfcare-pa-user-groups-rate-too-large',
    description: '[DOWNSTREAM SelfcarePA] HTTP 500 con RequestRateTooLarge nella risposta',
    priority: 110,
    condition: {
      type: 'and',
      conditions: [
        { type: 'exists', ref: 'vars.externalRegistriesTraceLogCount' },
        stepEvidenceMatches(
          'query-pn-external-registries',
          '\\[DOWNSTREAM\\] Service SelfcarePA returned errors=500 Internal Server Error from GET ' +
            'https://api\\.selfcare\\.pagopa\\.it/external/v2/user-groups;' +
            '[^\\r\\n]*RequestRateTooLarge\\b[^\\r\\n]*TooManyRequests \\(429\\)',
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
  knownCase({
    id: 'selfcare-pa-read-timeout',
    description: '[DOWNSTREAM SelfcarePA] Timeout di lettura',
    priority: 100,
    condition: {
      type: 'and',
      conditions: [
        // Complete the documented q2 trace lookup before classifying q1 evidence.
        { type: 'exists', ref: 'vars.externalRegistriesTraceLogCount' },
        stepEvidenceMatches(
          'query-pn-external-registries',
          '\\[DOWNSTREAM\\] Service SelfcarePA returned errors=io\\.netty\\.handler\\.timeout\\.ReadTimeoutException\\b',
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
