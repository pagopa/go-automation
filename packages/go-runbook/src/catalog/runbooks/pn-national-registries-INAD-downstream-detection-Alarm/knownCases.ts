/**
 * Known cases for the pn-national-registries-INAD-downstream-detection-Alarm runbook.
 */
import { SEND_DOWNSTREAMS } from '../framework.js';
import { knownCase } from '../framework.js';
import type { KnownCase } from '../framework.js';

import { stepEvidenceMatches } from '../common/evidenceConditions.js';
const INAD_DIGITAL_DOMICILE_ENDPOINT = 'https://api.inad.gov.it/rest/inad/v1/domiciliodigitale/extract/{codiceFiscale}';
const INAD_OSCL_DIGITAL_DOMICILE_ENDPOINT =
  'https://domiciliodigitaleapi.oscl.infocamere.it/rest/inad/v1/domiciliodigitale/extract/';
/** Known INAD failures evaluated against the pn-national-registries downstream query. */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'inad-unauthorized-after-token-refresh-401',
    description: '[DOWNSTREAM INAD] HTTP 401 anche dopo il refresh del token',
    priority: 140,
    condition: stepEvidenceMatches(
      'query-pn-national-registries',
      'Service INAD returned errors=401 Unauthorized from GET ' +
        'https://domiciliodigitaleapi\\.oscl\\.infocamere\\.it/rest/inad/v1/domiciliodigitale/extract/[^\\s"]*',
    ),
    title: '[DOWNSTREAM INAD] Autenticazione fallita dopo il refresh del token (HTTP 401)',
    resolution: 'Thread Slack 03/09/2026',
    level: 'warn',
    details: [
      ['Servizio', 'pn-national-registries'],
      ['Endpoint', INAD_OSCL_DIGITAL_DOMICILE_ENDPOINT],
      ['Errore', '{{vars.nationalRegistriesErrorMsg}}'],
      ['Trace ID', '{{vars.nationalRegistriesTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'HTTP 401 Unauthorized restituito da INAD anche dopo il refresh del token.',
      downstreams: [SEND_DOWNSTREAMS.INAD],
      finalActions: [],
      links: [
        {
          url: 'https://pagopaspa.slack.com/archives/C087KRMD16E/p1788443083384209',
          name: 'Thread Slack 03/09/2026',
          type: 'SLACK',
        },
      ],
    },
  }),
  knownCase({
    id: 'inad-digital-domicile-internal-server-error-500',
    description: '[DOWNSTREAM INAD] HTTP 500 durante il recupero del domicilio digitale',
    priority: 130,
    condition: stepEvidenceMatches(
      'query-pn-national-registries',
      '\\[DOWNSTREAM\\] Service INAD returned errors=500 Internal Server Error from GET ' +
        'https://api\\.inad\\.gov\\.it/rest/inad/v1/domiciliodigitale/extract/[^\\s"]+',
    ),
    resolution: 'Thread Slack segnalazione 02/10/2026',
    details: [
      ['Servizio', 'pn-national-registries'],
      ['Endpoint', INAD_DIGITAL_DOMICILE_ENDPOINT],
      ['Errore', '{{vars.nationalRegistriesErrorMsg}}'],
      ['Trace ID', '{{vars.nationalRegistriesTraceId}}'],
    ],
    level: 'warn',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: `HTTP 500 restituito da INAD durante la chiamata GET ${INAD_DIGITAL_DOMICILE_ENDPOINT}.`,
      downstreams: [SEND_DOWNSTREAMS.INAD],
      finalActions: [],
      links: [
        {
          url: 'https://pagopaspa.slack.com/archives/C064KJYNLPL/p1790939699138239',
          name: 'Thread Slack segnalazione 02/10/2026',
          type: 'SLACK',
        },
      ],
    },
  }),
  knownCase({
    id: 'inad-connection-reset-by-peer',
    description: '[DOWNSTREAM INAD] Connessione chiusa dal downstream',
    priority: 120,
    condition: stepEvidenceMatches(
      'query-pn-national-registries',
      '\\[DOWNSTREAM\\] Service INAD returned errors=recvAddress\\(\\.\\.\\) failed: Connection reset by peer',
    ),
    resolution:
      'Monitorare la risorsa per verificare le tempistiche del disservizio. Nel caso in esame \u00E8 rientrato al successivo evento di polling e non si sono intraprese altre azioni',
    details: [
      ['Servizio', 'pn-national-registries'],
      ['Endpoint', 'api.inad.gov.it'],
      ['Errore', '{{vars.nationalRegistriesErrorMsg}}'],
      ['Trace ID', '{{vars.nationalRegistriesTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Connessione verso INAD interrotta dal peer remoto durante la ricezione.',
      downstreams: [SEND_DOWNSTREAMS.INAD],
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'inad-connect-timeout',
    description: '[DOWNSTREAM INAD] Timeout di connessione',
    priority: 110,
    condition: stepEvidenceMatches(
      'query-pn-national-registries',
      '\\[DOWNSTREAM\\] Service INAD returned errors=connection timed out after \\d+ ms: ' +
        'api\\.inad\\.gov\\.it/[^\\s"]+:443',
    ),
    resolution:
      'Monitorare la risorsa per verificare le tempistiche del disservizio. Nel caso in esame \u00E8 rientrato al successivo evento di polling e non si sono intraprese altre azioni',
    details: [
      ['Servizio', 'pn-national-registries'],
      ['Endpoint', 'api.inad.gov.it:443'],
      ['Errore', '{{vars.nationalRegistriesErrorMsg}}'],
      ['Trace ID', '{{vars.nationalRegistriesTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Connessione TLS verso api.inad.gov.it:443 scaduta prima di essere stabilita.',
      downstreams: [SEND_DOWNSTREAMS.INAD],
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'inad-service-unavailable-503',
    description: '[DOWNSTREAM INAD] Servizio temporaneamente non disponibile (HTTP 503)',
    priority: 100,
    condition: stepEvidenceMatches(
      'query-pn-national-registries',
      '\\[DOWNSTREAM\\] Service INAD returned errors=503 Service Unavailable',
    ),
    title: '[DOWNSTREAM INAD] Servizio non disponibile (HTTP 503)',
    resolution:
      'Monitorare la risorsa per verificare le tempistiche del disservizio. Nel caso in esame \u00E8 rientrato al successivo evento di polling e non si sono intraprese altre azioni',
    details: [
      ['Servizio', 'pn-national-registries'],
      ['Errore', '{{vars.nationalRegistriesErrorMsg}}'],
      ['Trace ID', '{{vars.nationalRegistriesTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails: 'HTTP 503 Service Unavailable restituito dal downstream INAD.',
      downstreams: [SEND_DOWNSTREAMS.INAD],
      finalActions: [],
      links: [],
    },
  }),
];
