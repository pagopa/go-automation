import { knownCase, SEND_DOWNSTREAMS } from '../framework.js';
import type { KnownCase } from '../framework.js';

import { jiraLink, slackLink } from '../common/analysisLinks.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';

const IO_MESSAGES_ENDPOINT = 'https://api.io.pagopa.it/api/v1/messages';
const IO_ACTIVATIONS_ENDPOINT = 'https://api.io.pagopa.it/api/v1/activations/';
const IO_INCIDENT_THREAD = 'https://pagopaspa.slack.com/archives/C087KRMD16E/p1788777409771749';
const GO_INCIDENT_THREAD = 'https://pagopaspa.slack.com/archives/C064KJYNLPL/p1788778720713519';

/**
 * Includes the two cases documented in Confluence page 3312976074, version 3,
 * plus the additional signatures verified in the retained production logs.
 * Missing resolution guidance is not evidence that an incident is resolved:
 * every case remains IN_PROGRESS until recovery is verified.
 */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'io-meter-not-found',
    description: '[DOWNSTREAM IO] Contatore applicativo NumberOfIOMessageSentSuccessfully non trovato',
    priority: 190,
    condition: stepEvidenceMatches(
      'query-pn-external-registries',
      '\\[DOWNSTREAM\\] Service IO returned errors=Unable to find a meter that matches all the requirements at once\\.' +
        '[\\s\\S]*NumberOfIOMessageSentSuccessfully',
    ),
    resolution:
      'Verificare la registrazione del contatore Micrometer NumberOfIOMessageSentSuccessfully e il deployment di ' +
      'pn-external-registries. Mantenere l’analisi aperta: questo errore applicativo non dimostra un disservizio IO ' +
      'né conferma l’esito dell’invio.',
    level: 'warn',
    details: [
      ['Servizio', 'pn-external-registries'],
      ['Errore', '{{vars.externalRegistriesErrorMsg}}'],
      ['Trace ID', '{{vars.externalRegistriesTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails:
        'MeterNotFoundException sul contatore NumberOfIOMessageSentSuccessfully, emessa con il marker downstream IO.',
      downstreams: [SEND_DOWNSTREAMS.APP_IO],
    },
  }),
  knownCase({
    id: 'io-activation-cosmos-conflict',
    description: '[DOWNSTREAM IO] HTTP 500 su activations per conflitto Cosmos DB',
    priority: 180,
    condition: stepEvidenceMatches(
      'query-pn-external-registries',
      '\\[DOWNSTREAM\\] Service IO returned errors=500 Internal Server Error from PUT ' +
        'https://api\\.io\\.pagopa\\.it/api/v1/activations/;[\\s\\S]*Error upserting service Activation' +
        '[\\s\\S]*COSMOS_ERROR_RESPONSE[\\s\\S]*409/Entity with the specified id already exists',
    ),
    resolution:
      'Correlare il trace_id con la richiesta di attivazione e verificare perché IO/Cosmos DB segnala un’entità già ' +
      'esistente durante l’upsert. Mantenere l’analisi aperta fino alla verifica dell’esito dell’attivazione.',
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
    },
  }),
  knownCase({
    id: 'io-activation-cosmos-timeout',
    description: '[DOWNSTREAM IO] HTTP 500 su activations per timeout o routing Cosmos DB',
    priority: 170,
    condition: stepEvidenceMatches(
      'query-pn-external-registries',
      '\\[DOWNSTREAM\\] Service IO returned errors=500 Internal Server Error from PUT ' +
        'https://api\\.io\\.pagopa\\.it/api/v1/activations/;[\\s\\S]*Error upserting service Activation' +
        '[\\s\\S]*COSMOS_ERROR_RESPONSE[\\s\\S]*408/(?:Message:[\\s\\S]*requested operation exceeded maximum alloted time|An error occurred while routing the request)',
    ),
    resolution:
      'Correlare il trace_id e verificare timeout e routing sul Cosmos DB usato da IO. Mantenere l’analisi aperta ' +
      'finché non è confermato l’esito dell’attivazione.',
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
      errorDetails: `HTTP 500 da PUT ${IO_ACTIVATIONS_ENDPOINT}: timeout 408 o errore di routing Cosmos DB.`,
      downstreams: [SEND_DOWNSTREAMS.APP_IO],
    },
  }),
  knownCase({
    id: 'io-activation-not-found',
    description: '[DOWNSTREAM IO] Attivazione non trovata',
    priority: 160,
    condition: stepEvidenceMatches(
      'query-pn-external-registries',
      '\\[DOWNSTREAM\\] Service IO returned errors=404 Not Found from POST ' +
        'https://api\\.io\\.pagopa\\.it/api/v1/activations/;[\\s\\S]*Activation not found for the user',
    ),
    resolution:
      'Correlare il trace_id con la richiesta e verificare l’attivazione del destinatario su IO. Mantenere l’analisi ' +
      'aperta perché il metric filter tratta il 404 come errore downstream.',
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
    },
  }),
  knownCase({
    id: 'io-messages-connection-reset',
    description: '[DOWNSTREAM IO] Connessione resettata durante il recupero della configurazione remote-contents',
    priority: 150,
    condition: stepEvidenceMatches(
      'query-pn-external-registries',
      '\\[DOWNSTREAM\\] Service IO returned errors=500 Internal Server Error from POST ' +
        'https://api\\.io\\.pagopa\\.it/api/v1/messages;[\\s\\S]*request to ' +
        'https://api-app\\.internal\\.io\\.pagopa\\.it/api/v1/messages-sending/remote-contents/configurations/' +
        '[A-Za-z0-9_-]+ failed, reason: read ECONNRESET',
    ),
    resolution:
      'Correlare il trace_id e verificare la connettività verso api-app.internal.io.pagopa.it. Mantenere l’analisi ' +
      'aperta fino alla conferma del recupero della configurazione e dell’invio del messaggio.',
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
      errorDetails: `HTTP 500 da POST ${IO_MESSAGES_ENDPOINT}: connessione resettata durante il recupero remote-contents.`,
      downstreams: [SEND_DOWNSTREAMS.APP_IO],
    },
  }),
  knownCase({
    id: 'io-messages-cosmos-unavailable',
    description: '[DOWNSTREAM IO] Cosmos DB non disponibile durante l’invio del messaggio',
    priority: 140,
    condition: stepEvidenceMatches(
      'query-pn-external-registries',
      '\\[DOWNSTREAM\\] Service IO returned errors=500 Internal Server Error from POST ' +
        'https://api\\.io\\.pagopa\\.it/api/v1/messages;[\\s\\S]*code[\\s\\S]*503' +
        '[\\s\\S]*ServiceUnavailable[\\s\\S]*Channel is closed',
    ),
    resolution:
      'Correlare il trace_id e verificare la disponibilità del Cosmos DB usato da IO. Mantenere l’analisi aperta ' +
      'fino alla conferma dell’invio del messaggio.',
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
      errorDetails: `HTTP 500 da POST ${IO_MESSAGES_ENDPOINT}: Cosmos DB ha restituito ServiceUnavailable 503.`,
      downstreams: [SEND_DOWNSTREAMS.APP_IO],
    },
  }),
  knownCase({
    id: 'io-messages-generic-internal-error',
    description: '[DOWNSTREAM IO] HTTP 500 generico durante l’invio del messaggio',
    priority: 130,
    condition: stepEvidenceMatches(
      'query-pn-external-registries',
      '\\[DOWNSTREAM\\] Service IO returned errors=500 Internal Server Error from POST ' +
        'https://api\\.io\\.pagopa\\.it/api/v1/messages;[\\s\\S]*statusCode[\\s\\S]*500' +
        '[\\s\\S]*message[\\s\\S]*Internal server error[\\s\\S]*activityId',
    ),
    resolution:
      'Correlare trace_id e activityId con i log IO per identificare la causa del 500. Mantenere l’analisi aperta ' +
      'fino alla conferma dell’invio del messaggio.',
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
      errorDetails: `HTTP 500 generico da POST ${IO_MESSAGES_ENDPOINT}; la risposta espone soltanto un activityId.`,
      downstreams: [SEND_DOWNSTREAMS.APP_IO],
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
    priority: 120,
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
      'Mantenere l’analisi aperta e consultare PN-21426 e i due thread di segnalazione del 07/09/2026 ' +
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
        jiraLink('PN-21426'),
        slackLink(IO_INCIDENT_THREAD, 'Segnalazione IO del 07/09/2026'),
        slackLink(GO_INCIDENT_THREAD, 'Seconda segnalazione del 07/09/2026'),
      ],
    },
  }),
];
