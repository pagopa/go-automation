/**
 * Known cases for the pn-national-registries-InfoCamere-downstream-detection-Alarm runbook.
 */

import { SEND_DOWNSTREAMS } from '../framework.js';
import { knownCase } from '../framework.js';
import type { KnownCase } from '../framework.js';

import { slackLink } from '../common/analysisLinks.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';

const INFOCAMERE_PEC_ENDPOINT = 'https://icapis.infocamere.it/ic/pe/wspa/wspa/rest/richiestaElencoPec';
const INFOCAMERE_AUTHENTICATION_ENDPOINT = 'https://icapis.infocamere.it/ic/pe/wspa/wspa/rest/authentication';
const INFOCAMERE_LEGAL_REPRESENTATIVE_ENDPOINT =
  'https://icapis.infocamere.it/ic/pe/wspa/wspa/rest/listaLegaleRappresentante';
const INFOCAMERE_LEGAL_REPRESENTATIVE_THREAD = 'https://pagopaspa.slack.com/archives/C087KRMD16E/p1759230886444479';
const ANALYSIS_COMPLETED_FINAL_ACTION =
  'Analisi conclusa in autonomia dal team di GO. Non è necessario altro confronto';
const INFOCAMERE_TRANSIENT_FAILURE_RESOLUTION =
  'Nessuna azione operativa locale disponibile; monitorare il downstream InfoCamere e attenderne il ripristino.';

/**
 * Known InfoCamere failures evaluated against the pn-national-registries downstream query.
 *
 * Confluence v6, checked on 2026-10-03.
 */
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
    resolution: INFOCAMERE_TRANSIENT_FAILURE_RESOLUTION,
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
      finalActions: [ANALYSIS_COMPLETED_FINAL_ACTION],
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
    resolution: INFOCAMERE_TRANSIENT_FAILURE_RESOLUTION,
    details: [
      ['Servizio', 'pn-national-registries'],
      ['Endpoint', INFOCAMERE_AUTHENTICATION_ENDPOINT],
      ['Errore', '{{vars.nationalRegistriesErrorMsg}}'],
      ['Trace ID', '{{vars.nationalRegistriesTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails:
        `HTTP 500 Internal Server Error restituito da InfoCamere durante la chiamata POST ` +
        `${INFOCAMERE_AUTHENTICATION_ENDPOINT}.`,
      downstreams: [SEND_DOWNSTREAMS.INFOCAMERE],
      finalActions: [ANALYSIS_COMPLETED_FINAL_ACTION],
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
    resolution: INFOCAMERE_TRANSIENT_FAILURE_RESOLUTION,
    details: [
      ['Servizio', 'pn-national-registries'],
      ['Endpoint', 'icapis.infocamere.it'],
      ['Errore', '{{vars.nationalRegistriesErrorMsg}}'],
      ['Trace ID', '{{vars.nationalRegistriesTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Connessione verso icapis.infocamere.it scaduta prima di essere stabilita.',
      downstreams: [SEND_DOWNSTREAMS.INFOCAMERE],
      finalActions: [ANALYSIS_COMPLETED_FINAL_ACTION],
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
    resolution: INFOCAMERE_TRANSIENT_FAILURE_RESOLUTION,
    details: [
      ['Servizio', 'pn-national-registries'],
      ['Errore', '{{vars.nationalRegistriesErrorMsg}}'],
      ['Trace ID', '{{vars.nationalRegistriesTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Connessione verso InfoCamere interrotta dal peer remoto durante la ricezione.',
      downstreams: [SEND_DOWNSTREAMS.INFOCAMERE],
      finalActions: [ANALYSIS_COMPLETED_FINAL_ACTION],
    },
  }),
  knownCase({
    id: 'infocamere-legal-representative-internal-server-error-500',
    description: '[DOWNSTREAM InfoCamere] HTTP 500 durante l’elenco legale rappresentante',
    priority: 130,
    condition: stepEvidenceMatches(
      'query-pn-national-registries',

      '\\[DOWNSTREAM\\] Service InfoCamere returned errors=500 Internal Server Error from GET ' +
        'https://icapis\\.infocamere\\.it/ic/pe/wspa/wspa/rest/listaLegaleRappresentante/',
    ),
    title: '[DOWNSTREAM InfoCamere] Elenco legale rappresentante non disponibile (HTTP 500)',
    resolution:
      'Caso noto: il team di sviluppo sta mitigando l’errore con una retry strategy. ' +
      'La pagina non indica una risoluzione operativa; monitorare il downstream InfoCamere.',
    details: [
      ['Servizio', 'pn-national-registries'],
      ['Endpoint', INFOCAMERE_LEGAL_REPRESENTATIVE_ENDPOINT],
      ['Errore', '{{vars.nationalRegistriesErrorMsg}}'],
      ['Trace ID', '{{vars.nationalRegistriesTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails:
        'HTTP 500 (WSPA_ERR_00, appName wspa-lref) restituito da InfoCamere sulla chiamata GET ' +
        `${INFOCAMERE_LEGAL_REPRESENTATIVE_ENDPOINT}; mitigazione tramite retry strategy in corso lato sviluppo.`,
      downstreams: [SEND_DOWNSTREAMS.ELENCO_LEGALE_RAPPRESENTANTE_INFOCAMERE],
      finalActions: [ANALYSIS_COMPLETED_FINAL_ACTION],
      links: [slackLink(INFOCAMERE_LEGAL_REPRESENTATIVE_THREAD, 'Thread Slack 30/09/2025')],
    },
  }),
];
