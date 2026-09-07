import { knownCase, SEND_DOWNSTREAMS } from '../framework.js';
import type { KnownCase } from '../framework.js';

import { slackLink } from '../common/analysisLinks.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';

const IO_MESSAGES_ENDPOINT = 'https://api.io.pagopa.it/api/v1/messages';
const IO_INCIDENT_THREAD = 'https://pagopaspa.slack.com/archives/C087KRMD16E/p1788777409771749';
const GO_INCIDENT_THREAD = 'https://pagopaspa.slack.com/archives/C064KJYNLPL/p1788778720713519';

/**
 * The two cases documented in Confluence page 3312976074, version 2.
 * NA/empty resolution cells are not evidence that an incident is resolved:
 * retain IN_PROGRESS and do not invent remediation or completed final actions.
 */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'io-read-timeout',
    description: '[DOWNSTREAM IO] Timeout di rete in lettura',
    priority: 100,
    condition: stepEvidenceMatches(
      'query-pn-external-registries',
      '\\[DOWNSTREAM\\] Service IO returned errors=io\\.netty\\.handler\\.timeout\\.ReadTimeoutException\\b',
    ),
    resolution:
      'La procedura riporta NA come risoluzione del timeout IO. Mantenere l’analisi aperta: ' +
      'il riconoscimento dell’errore non conferma il ripristino del downstream.',
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
    },
  }),
  knownCase({
    id: 'io-messages-invalid-json-response-500',
    description: '[DOWNSTREAM IO] HTTP 500: risposta JSON incompleta delle configurazioni remote',
    priority: 110,
    // A single evidence predicate keeps the HTTP error and its specific cause
    // on the same log row, instead of combining unrelated query results.
    condition: stepEvidenceMatches(
      'query-pn-external-registries',
      '\\[DOWNSTREAM\\] Service IO returned errors=500 Internal Server Error from POST ' +
        'https://api\\.io\\.pagopa\\.it/api/v1/messages;' +
        '[^\\r\\n]*invalid json response body at ' +
        'https://api-app\\.internal\\.io\\.pagopa\\.it/api/v1/messages-sending/remote-contents/configurations/' +
        '[A-Za-z0-9_-]+ reason: Unexpected end of JSON input',
    ),
    resolution:
      'La pagina Confluence non indica una risoluzione operativa per questo HTTP 500. ' +
      'Mantenere l’analisi aperta e consultare i due thread di segnalazione del 07/09/2026 ' +
      'con le evidenze e il trace_id raccolti.',
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
      links: [
        slackLink(IO_INCIDENT_THREAD, 'Segnalazione IO del 07/09/2026'),
        slackLink(GO_INCIDENT_THREAD, 'Seconda segnalazione del 07/09/2026'),
      ],
    },
  }),
];
