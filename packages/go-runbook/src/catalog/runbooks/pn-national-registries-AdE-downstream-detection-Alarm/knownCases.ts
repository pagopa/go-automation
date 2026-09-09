/**
 * Known cases for the pn-national-registries-AdE-downstream-detection-Alarm runbook.
 */

import { SEND_DOWNSTREAMS } from '../framework.js';
import { knownCase } from '../framework.js';
import type { KnownCase } from '../framework.js';

import { stepEvidenceMatches } from '../common/evidenceConditions.js';

const ADE_LEGAL_REPRESENTATIVE_ENDPOINT =
  'https://gatewaywebservices.agenziaentrate.it/SPCBooleanoRappWS/VerificaRappresentanteEnteService';
const ANALYSIS_COMPLETED_FINAL_ACTION =
  'Analisi conclusa in autonomia dal team di GO. Non è necessario altro confronto';
const SPORADIC_TIMEOUT_RESOLUTION =
  'Nessuna azione necessaria se il timeout è sporadico. Se il problema persiste o si presenta la versione on-call ' +
  "dell'allarme, contattare i riferimenti del downstream Agenzia delle Entrate.";
const TRANSIENT_INTERNAL_SERVER_ERROR_RESOLUTION =
  'Nessuna azione operativa locale disponibile. Monitorare il downstream Agenzia delle Entrate e attenderne il ' +
  'ripristino; se il problema persiste o si presenta la versione on-call dell’allarme, contattare i riferimenti AdE.';

/** Known AdE timeouts evaluated against the pn-national-registries downstream query. */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'ade-legal-representative-internal-server-error-500',
    description: '[DOWNSTREAM AdE] HTTP 500 durante la verifica del rappresentante legale',
    priority: 120,
    condition: stepEvidenceMatches(
      'query-pn-national-registries',

      '\\[DOWNSTREAM\\] Service AdE returned errors=500 Internal Server Error from POST ' +
        'https://gatewaywebservices\\.agenziaentrate\\.it/SPCBooleanoRappWS/VerificaRappresentanteEnteService',
    ),
    resolution: TRANSIENT_INTERNAL_SERVER_ERROR_RESOLUTION,
    details: [
      ['Servizio', 'pn-national-registries'],
      ['Endpoint', ADE_LEGAL_REPRESENTATIVE_ENDPOINT],
      ['Errore', '{{vars.nationalRegistriesErrorMsg}}'],
      ['Trace ID', '{{vars.nationalRegistriesTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails: `HTTP 500 restituito da AdE durante la chiamata POST ${ADE_LEGAL_REPRESENTATIVE_ENDPOINT}.`,
      downstreams: [SEND_DOWNSTREAMS.VERIFICA_LEGALE_RAPPRESENTANTE_ADE],
      finalActions: [ANALYSIS_COMPLETED_FINAL_ACTION],
    },
  }),
  knownCase({
    id: 'ade-legal-representative-read-timeout',
    description: '[DOWNSTREAM AdE] Timeout durante la verifica del rappresentante legale',
    priority: 110,
    condition: stepEvidenceMatches(
      'query-pn-national-registries',

      '\\[DOWNSTREAM\\] Service AdE returned errors=<not specified>[\\s\\S]*Request to POST ' +
        'https://gatewaywebservices\\.agenziaentrate\\.it/SPCBooleanoRappWS/VerificaRappresentanteEnteService' +
        '[\\s\\S]*ReadTimeoutException',
    ),
    title: '[DOWNSTREAM AdE] Timeout verifica rappresentante legale',
    resolution: SPORADIC_TIMEOUT_RESOLUTION,
    details: [
      ['Servizio', 'pn-national-registries'],
      ['Endpoint', ADE_LEGAL_REPRESENTATIVE_ENDPOINT],
      ['Errore', '{{vars.nationalRegistriesErrorMsg}}'],
      ['Trace ID', '{{vars.nationalRegistriesTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails: `Timeout di lettura restituito da AdE durante la chiamata POST ${ADE_LEGAL_REPRESENTATIVE_ENDPOINT}.`,
      downstreams: [SEND_DOWNSTREAMS.VERIFICA_LEGALE_RAPPRESENTANTE_ADE],
      finalActions: [ANALYSIS_COMPLETED_FINAL_ACTION],
    },
  }),
  knownCase({
    id: 'ade-read-timeout',
    description: '[DOWNSTREAM AdE] Timeout di lettura generico',
    priority: 100,
    condition: stepEvidenceMatches(
      'query-pn-national-registries',

      '\\[DOWNSTREAM\\] Service AdE returned errors=nested exception is ' +
        'io\\.netty\\.handler\\.timeout\\.ReadTimeoutException',
    ),
    title: '[DOWNSTREAM AdE] Timeout di lettura',
    resolution: SPORADIC_TIMEOUT_RESOLUTION,
    details: [
      ['Servizio', 'pn-national-registries'],
      ['Errore', '{{vars.nationalRegistriesErrorMsg}}'],
      ['Trace ID', '{{vars.nationalRegistriesTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Timeout di lettura restituito dal downstream Agenzia delle Entrate a pn-national-registries.',
      downstreams: [SEND_DOWNSTREAMS.ADE],
      finalActions: [ANALYSIS_COMPLETED_FINAL_ACTION],
    },
  }),
];
