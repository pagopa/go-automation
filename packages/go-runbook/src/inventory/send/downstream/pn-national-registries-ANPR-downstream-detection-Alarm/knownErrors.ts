/**
 * Known errors for the pn-national-registries-ANPR-downstream-detection-Alarm runbook.
 */
import { downstreamMarkerPattern, knownError, SEND_DOWNSTREAMS } from '../../../../toolkits/send/index.js';
import { type KnownError, stepEvidenceMatches } from '../../../../engine/index.js';
const ANPR_NOTIFICATION_ENDPOINT =
  'https://modipa.anpr.interno.it/govway/rest/in/MinInternoPortaANPR-PDND/C001-servizioNotifica/v1/anpr-service-e002';
/** Known ANPR responses evaluated against the pn-national-registries downstream query. */
export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  knownError({
    code: 'SEND_DOWNSTREAM_PNRANPRDDA_ANP-NOT-FOU-404',
    description: '[DOWNSTREAM ANPR] Risposta HTTP 404 dal servizio di notifica',
    condition: stepEvidenceMatches(
      'query-pn-national-registries',
      downstreamMarkerPattern('ANPR', {
        status: '404 Not Found',
        method: 'POST',
        endpoint:
          'https://modipa.anpr.interno.it/govway/rest/in/MinInternoPortaANPR-PDND/C001-servizioNotifica/v1/anpr-service-e002',
      }),
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
  knownError({
    code: 'SEND_DOWNSTREAM_PNRANPRDDA_ANP-NOT-SPE-ERR',
    description: '[DOWNSTREAM ANPR] Errore senza dettaglio restituito dal downstream',
    condition: stepEvidenceMatches('query-pn-national-registries', `${downstreamMarkerPattern('ANPR')}<not specified>`),
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
  knownError({
    code: 'SEND_DOWNSTREAM_PNRANPRDDA_ANP-BAD-REQ-400',
    description: '[DOWNSTREAM ANPR] Risposta HTTP 400 dal servizio di notifica',
    condition: stepEvidenceMatches(
      'query-pn-national-registries',
      downstreamMarkerPattern('ANPR', {
        status: '400 Bad Request',
        method: 'POST',
        endpoint:
          'https://modipa.anpr.interno.it/govway/rest/in/MinInternoPortaANPR-PDND/C001-servizioNotifica/v1/anpr-service-e002',
      }),
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
