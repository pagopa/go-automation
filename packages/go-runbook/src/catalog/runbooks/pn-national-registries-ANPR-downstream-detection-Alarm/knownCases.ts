/**
 * Known cases for the pn-national-registries-ANPR-downstream-detection-Alarm runbook.
 */
import { SEND_DOWNSTREAMS } from '../framework.js';
import { knownCase } from '../framework.js';
import type { KnownCase } from '../framework.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';
const ANPR_NOTIFICATION_ENDPOINT =
  'https://modipa.anpr.interno.it/govway/rest/in/MinInternoPortaANPR-PDND/C001-servizioNotifica/v1/anpr-service-e002';
/** Known ANPR responses evaluated against the pn-national-registries downstream query. */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'anpr-not-found-404',
    description: '[DOWNSTREAM ANPR] Risposta HTTP 404 dal servizio di notifica',
    priority: 120,
    condition: stepEvidenceMatches(
      'query-pn-national-registries',
      '\\[DOWNSTREAM\\] Service ANPR returned errors=404 Not Found from POST ' +
        'https://modipa\\.anpr\\.interno\\.it/govway/rest/in/MinInternoPortaANPR-PDND/' +
        'C001-servizioNotifica/v1/anpr-service-e002',
    ),
    resolution:
      'Nessuna azione necessaria qualora sia solo un picco circoscritto in un intervallo di tempo limitato. Si tratterebbe di un disservizio momentaneo.',
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
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'anpr-not-specified-error',
    description: '[DOWNSTREAM ANPR] Errore senza dettaglio restituito dal downstream',
    priority: 110,
    condition: stepEvidenceMatches(
      'query-pn-national-registries',
      '\\[DOWNSTREAM\\] Service ANPR returned errors=<not specified>',
    ),
    title: '[DOWNSTREAM ANPR] Errore senza dettaglio',
    resolution:
      'Nessuna azione necessaria qualora sia solo un picco circoscritto in un intervallo di tempo limitato. Si tratterebbe di un disservizio momentaneo.',
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
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'anpr-bad-request-400',
    description: '[DOWNSTREAM ANPR] Risposta HTTP 400 dal servizio di notifica',
    priority: 100,
    condition: stepEvidenceMatches(
      'query-pn-national-registries',
      '\\[DOWNSTREAM\\] Service ANPR returned errors=400 Bad Request from POST ' +
        'https://modipa\\.anpr\\.interno\\.it/govway/rest/in/MinInternoPortaANPR-PDND/' +
        'C001-servizioNotifica/v1/anpr-service-e002',
    ),
    resolution:
      'Nessuna azione necessaria qualora sia solo un picco circoscritto in un intervallo di tempo limitato. Si tratterebbe di un disservizio momentaneo.',
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
      finalActions: [],
      links: [],
    },
  }),
];
