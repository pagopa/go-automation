/**
 * Known cases for the pn-national-registries-InfoCamere-downstream-detection-Alarm runbook.
 */
import { SEND_DOWNSTREAMS } from '../framework.js';
import { knownCase } from '../framework.js';
import type { KnownCase } from '../framework.js';

import { stepEvidenceMatches } from '../common/evidenceConditions.js';
const INFOCAMERE_PEC_ENDPOINT = 'https://icapis.infocamere.it/ic/pe/wspa/wspa/rest/richiestaElencoPec';
const INFOCAMERE_AUTHENTICATION_ENDPOINT = 'https://icapis.infocamere.it/ic/pe/wspa/wspa/rest/authentication';
const INFOCAMERE_LEGAL_REPRESENTATIVE_ENDPOINT =
  'https://icapis.infocamere.it/ic/pe/wspa/wspa/rest/listaLegaleRappresentante';
/** Known InfoCamere failures evaluated against the pn-national-registries downstream query. */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'infocamere-richiesta-elenco-pec-read-timeout',
    description: '[DOWNSTREAM InfoCamere] Timeout durante la richiesta elenco PEC',
    priority: 120,
    condition: stepEvidenceMatches(
      'query-pn-national-registries',
      '\\[DOWNSTREAM\\] Service InfoCamere returned errors=Unknown error' +
        '[\\s\\S]*org\\.springframework\\.web\\.reactive\\.function\\.client\\.WebClientRequestException' +
        '[\\s\\S]*Request to POST ' +
        'https://icapis\\.infocamere\\.it/ic/pe/wspa/wspa/rest/richiestaElencoPec' +
        '[\\s\\S]*io\\.netty\\.handler\\.timeout\\.ReadTimeoutException',
    ),
    resolution: 'Errore momentaneo. Non \u00E8 stato necessario contattare il contatto di downstream.',
    details: [
      ['Servizio', 'pn-national-registries'],
      ['Endpoint', INFOCAMERE_PEC_ENDPOINT],
      ['Errore', '{{vars.nationalRegistriesErrorMsg}}'],
      ['Trace ID', '{{vars.nationalRegistriesTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails: `ReadTimeoutException restituita da InfoCamere durante la chiamata POST ${INFOCAMERE_PEC_ENDPOINT}.`,
      downstreams: [SEND_DOWNSTREAMS.RICHIESTA_ELENCO_PEC_INFOCAMERE],
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'infocamere-authentication-internal-server-error-500',
    description: '[DOWNSTREAM InfoCamere] Errore HTTP 500 durante autenticazione',
    priority: 110,
    condition: stepEvidenceMatches(
      'query-pn-national-registries',
      '\\[DOWNSTREAM\\] Service InfoCamere returned errors=500 Internal Server Error from POST ' +
        'https://icapis\\.infocamere\\.it/ic/pe/wspa/wspa/rest/authentication(?:\\?client_id=[^\\s"]*)?',
    ),
    resolution: 'Risoluzione non documentata.',
    details: [
      ['Servizio', 'pn-national-registries'],
      ['Endpoint', INFOCAMERE_AUTHENTICATION_ENDPOINT],
      ['Errore', '{{vars.nationalRegistriesErrorMsg}}'],
      ['Trace ID', '{{vars.nationalRegistriesTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails:
        `HTTP 500 Internal Server Error restituito da InfoCamere durante la chiamata POST ` +
        `${INFOCAMERE_AUTHENTICATION_ENDPOINT}.`,
      downstreams: [SEND_DOWNSTREAMS.INFOCAMERE],
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'infocamere-connect-timeout',
    description: '[DOWNSTREAM InfoCamere] Timeout di connessione',
    priority: 100,
    condition: stepEvidenceMatches(
      'query-pn-national-registries',
      '\\[DOWNSTREAM\\] Service InfoCamere returned errors=finishConnect\\(\\.\\.\\) failed: ' +
        'Connection timed out: icapis\\.infocamere\\.it',
    ),
    resolution: 'Risoluzione non documentata.',
    details: [
      ['Servizio', 'pn-national-registries'],
      ['Endpoint', 'icapis.infocamere.it'],
      ['Errore', '{{vars.nationalRegistriesErrorMsg}}'],
      ['Trace ID', '{{vars.nationalRegistriesTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Connessione verso icapis.infocamere.it scaduta prima di essere stabilita.',
      downstreams: [SEND_DOWNSTREAMS.INFOCAMERE],
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'infocamere-connection-reset-by-peer',
    description: '[DOWNSTREAM InfoCamere] Connessione chiusa dal downstream',
    priority: 90,
    condition: stepEvidenceMatches(
      'query-pn-national-registries',
      '\\[DOWNSTREAM\\] Service InfoCamere returned errors=recvAddress\\(\\.\\.\\) failed: ' +
        'Connection reset by peer',
    ),
    resolution: 'Risoluzione non documentata.',
    details: [
      ['Servizio', 'pn-national-registries'],
      ['Errore', '{{vars.nationalRegistriesErrorMsg}}'],
      ['Trace ID', '{{vars.nationalRegistriesTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Connessione verso InfoCamere interrotta dal peer remoto durante la ricezione.',
      downstreams: [SEND_DOWNSTREAMS.INFOCAMERE],
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'infocamere-legal-representative-internal-server-error-500',
    description: '[DOWNSTREAM InfoCamere] HTTP 500 durante l’elenco legale rappresentante',
    priority: 130,
    condition: stepEvidenceMatches(
      'query-pn-national-registries',
      '\\[DOWNSTREAM\\] Service InfoCamere returned errors=500 Internal Server Error from GET ' +
        'https://icapis\\.infocamere\\.it/ic/pe/wspa/wspa/rest/listaLegaleRappresentante/[^\\s;"\\\\/]+;\\s*\\{' +
        '(?=[^}]*\\\\*"code\\\\*"\\s*:\\s*\\\\*"WSPA_ERR_00\\\\*")' +
        '(?=[^}]*\\\\*"appName\\\\*"\\s*:\\s*\\\\*"wspa-lref\\\\*")[^}]*\\}',
    ),
    title: '[DOWNSTREAM InfoCamere] Elenco legale rappresentante non disponibile (HTTP 500)',
    resolution: 'Risoluzione non documentata.',
    level: 'warn',
    details: [
      ['Servizio', 'pn-national-registries'],
      ['Endpoint', INFOCAMERE_LEGAL_REPRESENTATIVE_ENDPOINT],
      ['Errore', '{{vars.nationalRegistriesErrorMsg}}'],
      ['Trace ID', '{{vars.nationalRegistriesTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails:
        'HTTP 500 (WSPA_ERR_00, appName wspa-lref) restituito da InfoCamere sulla chiamata GET ' +
        `${INFOCAMERE_LEGAL_REPRESENTATIVE_ENDPOINT}; mitigazione tramite retry strategy in corso lato sviluppo.`,
      downstreams: [SEND_DOWNSTREAMS.ELENCO_LEGALE_RAPPRESENTANTE_INFOCAMERE],
      finalActions: [],
      links: [
        {
          url: 'https://pagopaspa.slack.com/archives/C087KRMD16E/p1759230886444479',
          name: 'Thread Slack 30/09/2025',
          type: 'SLACK',
        },
      ],
    },
  }),
];
