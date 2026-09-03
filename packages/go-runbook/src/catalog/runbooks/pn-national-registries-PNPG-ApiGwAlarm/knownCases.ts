import { varEquals, varMatches } from '../common/varConditions.js';
/**
 * Known cases for the pn-national-registries-PNPG-ApiGwAlarm runbook.
 */

import type { KnownCase } from '../framework.js';
import { knownCase } from '../framework.js';
import { SEND_DOWNSTREAMS } from '../framework.js';

import { apiGwPathMatches, apiGwStatusIs } from '../../../apigw/knownCases/conditions.js';
import { all } from '../common/conditions.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';

const INFOCAMERE_TRANSIENT_FAILURE_RESOLUTION =
  'Nessuna azione operativa locale disponibile; monitorare il downstream InfoCamere e attenderne il ripristino.';
const ANALYSIS_COMPLETED_FINAL_ACTION =
  'Analisi conclusa in autonomia dal team di GO. Non è necessario altro confronto';

/**
 * Known cases evaluated against the resulting context, highest priority
 * first.
 */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'downstream-ade-500-verifica-legale-rappresentante',
    description: 'Agenzia Entrate non disponibile durante verifica legale rappresentante',
    priority: 110,
    condition: stepEvidenceMatches(
      'query-pn-national-registries',

      '\\[DOWNSTREAM\\] Service AdE returned errors=500 Internal Server Error from POST https://gatewaywebservices\\.agenziaentrate\\.it/SPCBooleanoRappWS/VerificaRappresentanteEnteService',
    ),
    title: '[DOWNSTREAM] Service AdE returned errors=500 Internal Server Error',
    resolution: 'Chiusura - caso noto. Downstream Agenzia Entrate in errore durante verifica legale rappresentante.',
    details: [['Downstream', 'AdE']],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      downstreams: [SEND_DOWNSTREAMS.ADE],
    },
  }),
  knownCase({
    id: 'downstream-ade-read-timeout-verifica-legale-rappresentante',
    description: 'Timeout Agenzia Entrate durante verifica legale rappresentante',
    priority: 109,
    condition: all(
      apiGwStatusIs('504'),
      varMatches('apiGwErrorMessage', 'Endpoint request timed out'),
      apiGwPathMatches('^/national-registries-private/agenzia-entrate/legal$'),
      varEquals('nationalRegistriesNextUrlTarget', 'AdE'),
      stepEvidenceMatches(
        'query-pn-national-registries',

        '\\[DOWNSTREAM\\] Service AdE returned errors=<not specified>.*Request to POST https://gatewaywebservices\\.agenziaentrate\\.it/SPCBooleanoRappWS/VerificaRappresentanteEnteService.*ReadTimeoutException',
      ),
    ),
    title: 'Timeout downstream AdE - VerificaRappresentanteEnteService',
    resolution:
      'Chiusura - caso noto. Richiesta scaduta per timeout verso Agenzia Entrate durante verifica legale rappresentante.',
    details: [
      ['Endpoint', '{{vars.apiGwHttpMethod}} {{vars.apiGwPath}}'],
      ['Status Code', '{{vars.apiGwStatusCode}}'],
      ['Error', '{{vars.apiGwErrorMessage}}'],
      ['Downstream', 'AdE'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      downstreams: [SEND_DOWNSTREAMS.ADE],
    },
  }),
  knownCase({
    id: 'apigw-504-ade-legal-timeout-no-service-logs',
    description: 'Timeout API Gateway su verifica legale rappresentante AdE senza log applicativi correlati',
    priority: 108,
    condition: all(
      apiGwStatusIs('504'),
      varEquals('nationalRegistriesLogCount', '0'),
      varMatches('apiGwErrorMessage', 'Endpoint request timed out'),
      varEquals('apiGwHttpMethod', 'POST'),
      apiGwPathMatches('^/national-registries-private/agenzia-entrate/legal$'),
    ),
    title: 'API Gateway 504 - Endpoint request timed out su AdE legal',
    resolution:
      'Chiusura - caso noto. Timeout API Gateway durante verifica legale rappresentante verso Agenzia Entrate, senza log applicativi correlati nel servizio pn-national-registries.',
    details: [
      ['Endpoint', '{{vars.apiGwHttpMethod}} {{vars.apiGwPath}}'],
      ['Status Code', '{{vars.apiGwStatusCode}}'],
      ['Error', '{{vars.apiGwErrorMessage}}'],
      ['Downstream', 'AdE'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      downstreams: [SEND_DOWNSTREAMS.ADE],
    },
  }),
  knownCase({
    id: 'downstream-infocamere-read-timeout-authentication',
    description: 'Timeout InfoCamere durante authentication',
    priority: 107,
    condition: stepEvidenceMatches(
      'query-pn-national-registries',

      '\\[DOWNSTREAM\\] Service InfoCamere returned errors=<not specified>' +
        '[\\s\\S]*Request to POST ' +
        'https://icapis\\.infocamere\\.it/ic/pe/wspa/wspa/rest/authentication' +
        '[\\s\\S]*io\\.netty\\.handler\\.timeout\\.ReadTimeoutException',
    ),
    title: 'Timeout downstream InfoCamere durante autenticazione',
    resolution: INFOCAMERE_TRANSIENT_FAILURE_RESOLUTION,
    details: [
      ['Endpoint', '{{vars.apiGwHttpMethod}} {{vars.apiGwPath}}'],
      ['Status Code', '{{vars.apiGwStatusCode}}'],
      ['Downstream', 'InfoCamere'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails: 'ReadTimeoutException durante la chiamata POST verso l’endpoint di autenticazione InfoCamere.',
      downstreams: [SEND_DOWNSTREAMS.INFOCAMERE],
      finalActions: [ANALYSIS_COMPLETED_FINAL_ACTION],
    },
  }),
  knownCase({
    id: 'downstream-infocamere-connection-reset-authentication',
    description: 'Connessione InfoCamere chiusa durante authentication',
    priority: 106,
    condition: stepEvidenceMatches(
      'query-pn-national-registries',

      '\\[DOWNSTREAM\\] Service InfoCamere returned errors=recvAddress\\(\\.\\.\\) failed: ' +
        'Connection reset by peer[\\s\\S]*Request to POST ' +
        'https://icapis\\.infocamere\\.it/ic/pe/wspa/wspa/rest/authentication',
    ),
    title: 'Connessione downstream InfoCamere chiusa durante autenticazione',
    resolution: INFOCAMERE_TRANSIENT_FAILURE_RESOLUTION,
    details: [
      ['Endpoint', '{{vars.apiGwHttpMethod}} {{vars.apiGwPath}}'],
      ['Status Code', '{{vars.apiGwStatusCode}}'],
      ['Downstream', 'InfoCamere'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Connessione verso InfoCamere interrotta dal peer remoto durante l’autenticazione.',
      downstreams: [SEND_DOWNSTREAMS.INFOCAMERE],
      finalActions: [ANALYSIS_COMPLETED_FINAL_ACTION],
    },
  }),
  knownCase({
    id: 'downstream-infocamere-500-elenco-legale-rappresentante',
    description: 'InfoCamere non disponibile durante elenco legale rappresentante',
    priority: 105,
    condition: stepEvidenceMatches(
      'query-pn-national-registries',

      '\\[DOWNSTREAM\\] Service InfoCamere returned errors=500 Internal Server Error from GET https://icapis\\.infocamere\\.it/ic/pe/wspa/wspa/rest/listaLegaleRappresentante/',
    ),
    title: '[DOWNSTREAM] Service InfoCamere returned errors=500 Internal Server Error',
    resolution: 'Chiusura - caso noto. Scenario dipendente da problematica del downstream InfoCamere gia segnalata.',
    details: [['Downstream', 'InfoCamere']],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      downstreams: [SEND_DOWNSTREAMS.INFOCAMERE],
    },
  }),
  knownCase({
    id: 'downstream-infocamere-500-authentication',
    description: 'InfoCamere non disponibile durante authentication',
    priority: 104,
    condition: stepEvidenceMatches(
      'query-pn-national-registries',

      '\\[DOWNSTREAM\\] Service InfoCamere returned errors=500 Internal Server Error from POST https://icapis\\.infocamere\\.it/ic/pe/wspa/wspa/rest/authentication(?:\\?client_id=[^\\s"]*)?',
    ),
    title: '[DOWNSTREAM] Service InfoCamere returned errors=500 Internal Server Error',
    resolution: 'Chiusura - caso noto. Downstream InfoCamere in errore durante autenticazione.',
    details: [['Downstream', 'InfoCamere']],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      downstreams: [SEND_DOWNSTREAMS.INFOCAMERE],
    },
  }),
  knownCase({
    id: 'apigw-504-infocamere-inad-timeout',
    description: 'Timeout API Gateway su legal-institutions per tempi risposta INAD/InfoCamere',
    priority: 103,
    condition: all(
      apiGwStatusIs('504'),
      varEquals('nationalRegistriesLogCount', '0'),
      varMatches('apiGwErrorMessage', 'Endpoint request timed out'),
      apiGwPathMatches('^/national-registries-private/infocamere/legal-institutions$'),
    ),
    title: 'API Gateway 504 - Endpoint request timed out su INAD/InfoCamere',
    resolution:
      "Chiusura - caso noto. Allarme scattato a causa di richieste scadute per timeout di attesa dal richiedente, a sua volta dovuto agli elevati tempi di risposta da parte di INAD/InfoCamere (v. analisi dell'oncall-pn-national-registries-PNPG-ApiGwLatencyAlarm).",
    details: [
      ['Endpoint', '{{vars.apiGwHttpMethod}} {{vars.apiGwPath}}'],
      ['Status Code', '{{vars.apiGwStatusCode}}'],
      ['Error', '{{vars.apiGwErrorMessage}}'],
      ['Downstream', 'INAD/InfoCamere'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      downstreams: [SEND_DOWNSTREAMS.INAD, SEND_DOWNSTREAMS.INFOCAMERE],
    },
  }),
  knownCase({
    id: 'apigw-504-timeout',
    description: 'API Gateway 504 per timeout di risposta dal backend',
    priority: 100,
    condition: all(apiGwStatusIs('504'), varMatches('apiGwErrorMessage', 'Execution failed due to a timeout error')),
    title: 'API Gateway 504 - Execution failed due to a timeout error',
    resolution:
      'Nessuna azione necessaria. Timeout transitorio dovuto a ritardo di risposta del backend verso API Gateway.',
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
    },
  }),
];
