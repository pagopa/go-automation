/**
 * Known errors for the pn-national-registries-AdE-downstream-detection-Alarm runbook.
 */
import { downstreamMarkerPattern, knownError, SEND_DOWNSTREAMS } from '../../../../toolkits/send/index.js';
import { type KnownError, stepEvidenceMatches } from '../../../../engine/index.js';
const ADE_LEGAL_REPRESENTATIVE_ENDPOINT =
  'https://gatewaywebservices.agenziaentrate.it/SPCBooleanoRappWS/VerificaRappresentanteEnteService';
/** Known AdE timeouts evaluated against the pn-national-registries downstream query. */
export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  knownError({
    code: 'SEND_DOWNSTREAM_PNRAEDDA_ADE-LEG-REP-INT-SER-ERR-500',
    description: '[DOWNSTREAM AdE] HTTP 500 durante la verifica del rappresentante legale',
    condition: stepEvidenceMatches(
      'query-pn-national-registries',
      downstreamMarkerPattern('AdE', {
        status: '500 Internal Server Error',
        method: 'POST',
        endpoint: 'https://gatewaywebservices.agenziaentrate.it/SPCBooleanoRappWS/VerificaRappresentanteEnteService',
      }),
    ),
    resolution: 'Risoluzione non documentata.',
    details: [
      ['Servizio', 'pn-national-registries'],
      ['Endpoint', ADE_LEGAL_REPRESENTATIVE_ENDPOINT],
      ['Errore', '{{vars.nationalRegistriesErrorMsg}}'],
      ['Trace ID', '{{vars.nationalRegistriesTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: `HTTP 500 restituito da AdE durante la chiamata POST ${ADE_LEGAL_REPRESENTATIVE_ENDPOINT}.`,
      downstreams: [SEND_DOWNSTREAMS.VERIFICA_LEGALE_RAPPRESENTANTE_ADE],
      finalActions: [],
      links: [],
    },
  }),
  knownError({
    code: 'SEND_DOWNSTREAM_PNRAEDDA_ADE-LEG-REP-REA-TIM',
    description: '[DOWNSTREAM AdE] Timeout durante la verifica del rappresentante legale',
    condition: stepEvidenceMatches(
      'query-pn-national-registries',
      `${downstreamMarkerPattern('AdE')}<not specified>` +
        '[\\s\\S]*Request to POST ' +
        'https://gatewaywebservices\\.agenziaentrate\\.it/SPCBooleanoRappWS/VerificaRappresentanteEnteService' +
        '[\\s\\S]*ReadTimeoutException',
    ),
    title: '[DOWNSTREAM AdE] Timeout verifica rappresentante legale',
    resolution:
      'Nessuna azione necessaria se l\u2019errore si verifica sporadicamente. Se dovesse presentarsi la versione oncall di questo allarme, specialmente se in reperibilit\u00E0, valutare la possibilit\u00E0 di contattare gli opportuni contatti di Downstream presenti in Runbook downstream',
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
      finalActions: [],
      links: [],
    },
  }),
  knownError({
    code: 'SEND_DOWNSTREAM_PNRAEDDA_ADE-REA-TIM',
    description: '[DOWNSTREAM AdE] Timeout di lettura generico',
    condition: stepEvidenceMatches(
      'query-pn-national-registries',
      `${downstreamMarkerPattern('AdE')}nested exception is io\\.netty\\.handler\\.timeout\\.ReadTimeoutException`,
    ),
    title: '[DOWNSTREAM AdE] Timeout di lettura',
    resolution:
      'Nessuna azione necessaria se l\u2019errore si verifica sporadicamente. Se dovesse presentarsi la versione oncall di questo allarme, specialmente se in reperibilit\u00E0, valutare la possibilit\u00E0 di contattare gli opportuni contatti di Downstream presenti in Runbook downstream',
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
      finalActions: [],
      links: [],
    },
  }),
];
