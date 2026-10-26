import { knownCase, SEND_DOWNSTREAMS } from '../framework.js';
import type { KnownCase } from '../framework.js';

import { stepEvidenceMatches } from '../common/evidenceConditions.js';
const IO_MESSAGES_ENDPOINT = 'https://api.io.pagopa.it/api/v1/messages';
const IO_ACTIVATIONS_ENDPOINT = 'https://api.io.pagopa.it/api/v1/activations/';
/** Documented IO cases; resolutions are limited to their recorded sources. */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'io-activation-cosmos-conflict',
    description: '[DOWNSTREAM IO] HTTP 500 su activations per conflitto Cosmos DB',
    priority: 180,
    condition: stepEvidenceMatches(
      'query-pn-external-registries',
      '\\[DOWNSTREAM\\] Service IO returned errors=500 Internal Server Error from PUT ' +
        'https://api\\.io\\.pagopa\\.it/api/v1/activations/;[\\s\\S]*Error upserting service Activation' +
        '[\\s\\S]*COSMOS_ERROR_RESPONSE\\b[\\s\\S]*409/Entity with the specified id already exists\\b',
    ),
    resolution: 'Segnalare a Infra e valutare se aprire una segnalazione al team APP IO.',
    level: 'warn',
    details: [
      ['Servizio', 'pn-external-registries'],
      ['Endpoint', IO_ACTIVATIONS_ENDPOINT],
      ['Errore', '{{vars.externalRegistriesErrorMsg}}'],
      ['Trace ID', '{{vars.externalRegistriesTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: `HTTP 500 da PUT ${IO_ACTIVATIONS_ENDPOINT}: conflitto 409 restituito da Cosmos DB durante l’upsert.`,
      downstreams: [SEND_DOWNSTREAMS.APP_IO],
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'io-activation-not-found',
    description: '[DOWNSTREAM IO] Attivazione non trovata',
    priority: 160,
    condition: stepEvidenceMatches(
      'query-pn-external-registries',
      '\\[DOWNSTREAM\\] Service IO returned errors=404 Not Found from POST ' +
        'https://api\\.io\\.pagopa\\.it/api/v1/activations/;[\\s\\S]*Activation not found for the user\\b',
    ),
    resolution: 'Risoluzione non documentata.',
    level: 'warn',
    details: [
      ['Servizio', 'pn-external-registries'],
      ['Endpoint', IO_ACTIVATIONS_ENDPOINT],
      ['Errore', '{{vars.externalRegistriesErrorMsg}}'],
      ['Trace ID', '{{vars.externalRegistriesTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: `HTTP 404 da POST ${IO_ACTIVATIONS_ENDPOINT}: attivazione IO non trovata per il destinatario.`,
      downstreams: [SEND_DOWNSTREAMS.APP_IO],
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'io-read-timeout',
    description: '[DOWNSTREAM IO] Timeout di rete in lettura',
    priority: 100,
    condition: stepEvidenceMatches(
      'query-pn-external-registries',
      '\\[DOWNSTREAM\\] Service IO returned errors=io\\.netty\\.handler\\.timeout\\.ReadTimeoutException\\b',
    ),
    resolution: 'Risoluzione non documentata.',
    level: 'warn',
    details: [
      ['Servizio', 'pn-external-registries'],
      ['Errore', '{{vars.externalRegistriesErrorMsg}}'],
      ['Trace ID', '{{vars.externalRegistriesTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Timeout di rete io.netty.handler.timeout.ReadTimeoutException verso il downstream IO.',
      downstreams: [SEND_DOWNSTREAMS.APP_IO],
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'io-messages-invalid-json-response-500',
    description: '[DOWNSTREAM IO] HTTP 500: risposta JSON incompleta delle configurazioni remote',
    priority: 120,
    // A single evidence predicate keeps the HTTP error and its specific cause
    // on the same log row, instead of combining unrelated query results.
    condition: stepEvidenceMatches(
      'query-pn-external-registries',
      '\\[DOWNSTREAM\\] Service IO returned errors=500 Internal Server Error from POST ' +
        'https://api\\.io\\.pagopa\\.it/api/v1/messages;' +
        '[^\\r\\n]*invalid json response body at ' +
        'https://api-app\\.internal\\.io\\.pagopa\\.it/api/v1/messages-sending/remote-contents/configurations/' +
        '[A-Za-z0-9_-]+ reason: Unexpected end of JSON input\\b',
    ),
    resolution:
      'PN-21426. La card descrive un invio Courtesy riuscito al retry senza il successivo salvataggio dell\u2019evento SEND_COURTESY_MESSAGE in timeline.',
    level: 'warn',
    details: [
      ['Servizio', 'pn-external-registries'],
      ['Endpoint', IO_MESSAGES_ENDPOINT],
      ['Errore', '{{vars.externalRegistriesErrorMsg}}'],
      ['Trace ID', '{{vars.externalRegistriesTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails:
        `HTTP 500 da POST ${IO_MESSAGES_ENDPOINT}: risposta JSON incompleta durante la lettura ` +
        'delle configurazioni remote-contents di IO (Unexpected end of JSON input).',
      downstreams: [SEND_DOWNSTREAMS.APP_IO],
      finalActions: [],
      links: [
        { url: 'https://pagopa.atlassian.net/browse/PN-21426', name: 'PN-21426', type: 'JIRA' },
        {
          url: 'https://pagopaspa.slack.com/archives/C087KRMD16E/p1788777409771749',
          name: 'Segnalazione IO del 07/09/2026',
          type: 'SLACK',
        },
        {
          url: 'https://pagopaspa.slack.com/archives/C064KJYNLPL/p1788778720713519',
          name: 'Seconda segnalazione del 07/09/2026',
          type: 'SLACK',
        },
      ],
    },
  }),
];
