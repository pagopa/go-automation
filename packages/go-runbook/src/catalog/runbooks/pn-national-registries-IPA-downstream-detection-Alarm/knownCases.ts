/**
 * Known cases for the pn-national-registries-IPA-downstream-detection-Alarm runbook.
 */

import { SEND_DOWNSTREAMS } from '../framework.js';
import type { KnownCase } from '../framework.js';

const IPA_WS23_ENDPOINT = 'https://www.indicepa.gov.it/ws/WS23DOMDIGCFServices/api/WS23_DOM_DIG_CF';
const ANALYSIS_COMPLETED_FINAL_ACTION =
  'Analisi conclusa in autonomia dal team di GO. Non è necessario altro confronto';

/** Known IPA responses and failures evaluated against the pn-national-registries log query. */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  {
    id: 'ipa-known-response-404',
    description: '[DOWNSTREAM IPA] Risposta nota senza intervento operativo (HTTP 404)',
    priority: 110,
    condition: {
      type: 'contains',
      ref: 'steps.query-pn-national-registries',
      regex: '\\[DOWNSTREAM\\] Service IPA returned errors=404(?![0-9])',
    },
    action: {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      message:
        '[CASO NOTO] [DOWNSTREAM IPA] Risposta HTTP 404\n' +
        'Risoluzione: non è richiesta alcuna azione operativa; registrare la casistica e proseguire il monitoraggio.\n' +
        'Servizio: pn-national-registries\n' +
        'Errore: {{vars.nationalRegistriesErrorMsg}}\n' +
        'Trace ID: {{vars.nationalRegistriesTraceId}}\n',
    },
    analysis: {
      resolution: 'Non è richiesta alcuna azione operativa; registrare la casistica e proseguire il monitoraggio.',
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails:
        'HTTP 404 restituito dal downstream IPA; casistica originariamente esclusa dalla query operativa e ora censita esplicitamente.',
      downstreams: [SEND_DOWNSTREAMS.IPA],
      finalActions: [ANALYSIS_COMPLETED_FINAL_ACTION],
    },
  },
  {
    id: 'ipa-service-unavailable-503',
    description: '[DOWNSTREAM IPA] Indice PA temporaneamente non disponibile (HTTP 503)',
    priority: 100,
    condition: {
      type: 'contains',
      ref: 'steps.query-pn-national-registries',
      regex:
        '\\[DOWNSTREAM\\] Service IPA returned errors=503 Service Unavailable from POST ' +
        'https://www\\.indicepa\\.gov\\.it/ws/WS23DOMDIGCFServices/api/WS23_DOM_DIG_CF',
    },
    action: {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      message:
        '[CASO NOTO] [DOWNSTREAM IPA] Indice PA non disponibile (HTTP 503)\n' +
        'Risoluzione: monitorare il downstream IPA e attenderne il ripristino; nel caso censito il servizio è rientrato al polling successivo senza ulteriori azioni.\n' +
        'Servizio: pn-national-registries\n' +
        `Endpoint: ${IPA_WS23_ENDPOINT}\n` +
        'Errore: {{vars.nationalRegistriesErrorMsg}}\n' +
        'Trace ID: {{vars.nationalRegistriesTraceId}}\n',
    },
    analysis: {
      resolution:
        'Monitorare il downstream IPA e attenderne il ripristino; nel caso censito il servizio è rientrato al polling successivo senza ulteriori azioni.',
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails: `HTTP 503 Service Unavailable restituito da IPA sulla chiamata POST ${IPA_WS23_ENDPOINT}.`,
      downstreams: [SEND_DOWNSTREAMS.IPA],
      finalActions: [ANALYSIS_COMPLETED_FINAL_ACTION],
    },
  },
];
