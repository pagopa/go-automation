/**
 * Known cases for the pn-national-registries-ANPR-downstream-detection-Alarm runbook.
 */

import { SEND_DOWNSTREAMS } from '../framework.js';
import { knownCase } from '../framework.js';
import type { KnownCase } from '../framework.js';

const ANPR_NOTIFICATION_ENDPOINT =
  'https://modipa.anpr.interno.it/govway/rest/in/MinInternoPortaANPR-PDND/C001-servizioNotifica/v1/anpr-service-e002';
const ANALYSIS_COMPLETED_FINAL_ACTION =
  'Analisi conclusa in autonomia dal team di GO. Non è necessario altro confronto';
const TRANSIENT_ANPR_FAILURE_RESOLUTION =
  'Nessuna azione operativa necessaria se si tratta di un picco circoscritto; monitorare il downstream ANPR e ' +
  'attenderne il ripristino.';

/** Known ANPR responses evaluated against the pn-national-registries downstream query. */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'anpr-not-found-404',
    description: '[DOWNSTREAM ANPR] Risposta HTTP 404 dal servizio di notifica',
    priority: 120,
    condition: {
      type: 'contains',
      ref: 'steps.query-pn-national-registries',
      regex:
        '\\[DOWNSTREAM\\] Service ANPR returned errors=404 Not Found from POST ' +
        'https://modipa\\.anpr\\.interno\\.it/govway/rest/in/MinInternoPortaANPR-PDND/' +
        'C001-servizioNotifica/v1/anpr-service-e002',
    },
    resolution: TRANSIENT_ANPR_FAILURE_RESOLUTION,
    details: [
      ['Servizio', 'pn-national-registries'],
      ['Endpoint', ANPR_NOTIFICATION_ENDPOINT],
      ['Errore', '{{vars.nationalRegistriesErrorMsg}}'],
      ['Trace ID', '{{vars.nationalRegistriesTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails: `HTTP 404 Not Found restituito da ANPR sulla chiamata POST ${ANPR_NOTIFICATION_ENDPOINT}.`,
      downstreams: [SEND_DOWNSTREAMS.ANPR],
      finalActions: [ANALYSIS_COMPLETED_FINAL_ACTION],
    },
  }),
  knownCase({
    id: 'anpr-not-specified-error',
    description: '[DOWNSTREAM ANPR] Errore senza dettaglio restituito dal downstream',
    priority: 110,
    condition: {
      type: 'contains',
      ref: 'steps.query-pn-national-registries',
      regex: '\\[DOWNSTREAM\\] Service ANPR returned errors=<not specified>',
    },
    title: '[DOWNSTREAM ANPR] Errore senza dettaglio',
    resolution: TRANSIENT_ANPR_FAILURE_RESOLUTION,
    details: [
      ['Servizio', 'pn-national-registries'],
      ['Errore', '{{vars.nationalRegistriesErrorMsg}}'],
      ['Trace ID', '{{vars.nationalRegistriesTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Errore senza dettaglio (<not specified>) restituito dal downstream ANPR.',
      downstreams: [SEND_DOWNSTREAMS.ANPR],
      finalActions: [ANALYSIS_COMPLETED_FINAL_ACTION],
    },
  }),
  knownCase({
    id: 'anpr-bad-request-400',
    description: '[DOWNSTREAM ANPR] Risposta HTTP 400 dal servizio di notifica',
    priority: 100,
    condition: {
      type: 'contains',
      ref: 'steps.query-pn-national-registries',
      regex:
        '\\[DOWNSTREAM\\] Service ANPR returned errors=400 Bad Request from POST ' +
        'https://modipa\\.anpr\\.interno\\.it/govway/rest/in/MinInternoPortaANPR-PDND/' +
        'C001-servizioNotifica/v1/anpr-service-e002',
    },
    resolution: TRANSIENT_ANPR_FAILURE_RESOLUTION,
    details: [
      ['Servizio', 'pn-national-registries'],
      ['Endpoint', ANPR_NOTIFICATION_ENDPOINT],
      ['Errore', '{{vars.nationalRegistriesErrorMsg}}'],
      ['Trace ID', '{{vars.nationalRegistriesTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails: `HTTP 400 Bad Request restituito da ANPR sulla chiamata POST ${ANPR_NOTIFICATION_ENDPOINT}.`,
      downstreams: [SEND_DOWNSTREAMS.ANPR],
      finalActions: [ANALYSIS_COMPLETED_FINAL_ACTION],
    },
  }),
];
