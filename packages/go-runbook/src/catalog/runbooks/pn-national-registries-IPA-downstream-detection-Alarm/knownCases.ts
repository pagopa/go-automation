/**
 * Known cases for the pn-national-registries-IPA-downstream-detection-Alarm runbook.
 */

import { SEND_DOWNSTREAMS } from '../framework.js';
import { knownCase } from '../framework.js';
import type { KnownCase } from '../framework.js';

import { stepEvidenceMatches } from '../common/evidenceConditions.js';

const IPA_WS23_ENDPOINT = 'https://www.indicepa.gov.it/ws/WS23DOMDIGCFServices/api/WS23_DOM_DIG_CF';
const ANALYSIS_COMPLETED_FINAL_ACTION =
  'Analisi conclusa in autonomia dal team di GO. Non è necessario altro confronto';

const IPA_TRANSIENT_FAILURE_RESOLUTION =
  'Monitorare il downstream IPA e attenderne il ripristino; nel caso censito il servizio è rientrato al polling successivo senza ulteriori azioni.';

/** Known IPA failures evaluated against the pn-national-registries log query. */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'ipa-service-unavailable-503',
    description: '[DOWNSTREAM IPA] Indice PA temporaneamente non disponibile (HTTP 503)',
    priority: 100,
    condition: stepEvidenceMatches(
      'query-pn-national-registries',

      '\\[DOWNSTREAM\\] Service IPA returned errors=503 Service Unavailable from POST ' +
        'https://www\\.indicepa\\.gov\\.it/ws/WS23DOMDIGCFServices/api/WS23_DOM_DIG_CF',
    ),
    title: '[DOWNSTREAM IPA] Indice PA non disponibile (HTTP 503)',
    resolution: IPA_TRANSIENT_FAILURE_RESOLUTION,
    details: [
      ['Servizio', 'pn-national-registries'],
      ['Endpoint', IPA_WS23_ENDPOINT],
      ['Errore', '{{vars.nationalRegistriesErrorMsg}}'],
      ['Trace ID', '{{vars.nationalRegistriesTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails: `HTTP 503 Service Unavailable restituito da IPA sulla chiamata POST ${IPA_WS23_ENDPOINT}.`,
      downstreams: [SEND_DOWNSTREAMS.IPA],
      finalActions: [ANALYSIS_COMPLETED_FINAL_ACTION],
    },
  }),
  knownCase({
    id: 'ipa-connection-prematurely-closed',
    description: '[DOWNSTREAM IPA] Connessione chiusa prematuramente dal downstream',
    priority: 120,
    condition: stepEvidenceMatches(
      'query-pn-national-registries',

      '\\[DOWNSTREAM\\] Service IPA returned errors=Connection prematurely closed BEFORE response\\b',
    ),
    title: '[DOWNSTREAM IPA] Connessione chiusa prima della risposta',
    resolution: IPA_TRANSIENT_FAILURE_RESOLUTION,
    details: [
      ['Servizio', 'pn-national-registries'],
      ['Errore', '{{vars.nationalRegistriesErrorMsg}}'],
      ['Trace ID', '{{vars.nationalRegistriesTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Connessione verso IPA chiusa prematuramente prima della risposta.',
      downstreams: [SEND_DOWNSTREAMS.IPA],
      finalActions: [ANALYSIS_COMPLETED_FINAL_ACTION],
    },
  }),
];
