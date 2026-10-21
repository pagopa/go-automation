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
/**
 * Known cases evaluated against the resulting context, highest priority
 * first.
 */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'apigw-504-legal-institutions-completion-observed',
    description: 'API Gateway 504 con completamento applicativo legal-institutions nello stesso trace',
    priority: 130,
    condition: all(
      apiGwStatusIs('504'),
      varMatches('apiGwErrorMessage', 'Endpoint request timed out'),
      varEquals('apiGwHttpMethod', 'POST'),
      apiGwPathMatches('^/national-registries-private/infocamere/legal-institutions$'),
      stepEvidenceMatches(
        'query-national-registries-completion',
        'Checking \\[INFO CAMERE\\] legal institutions passed',
      ),
    ),
    resolution: 'Risoluzione non documentata.',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'downstream-inad-connect-timeout',
    description: 'Timeout di connessione verso INAD',
    priority: 120,
    condition: stepEvidenceMatches(
      'query-pn-national-registries',
      '\\[DOWNSTREAM\\] Service INAD returned errors=connection timed out after [0-9]+ ms: api\\.inad\\.gov\\.it',
    ),
    resolution:
      'Da segnalare se si presenta pi\u00F9 volte in un intervallo di tempo ristretto. Vedi Thread Slack 05/03/2026',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      downstreams: [SEND_DOWNSTREAMS.INAD],
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'downstream-ade-connect-timeout',
    description: 'Timeout di connessione verso Agenzia Entrate',
    priority: 119,
    condition: stepEvidenceMatches(
      'query-pn-national-registries',
      '\\[DOWNSTREAM\\] Service AdE returned errors=connection timed out after [0-9]+ ms: gatewaywebservices\\.agenziaentrate\\.it',
    ),
    resolution: 'Thread Slack 21/09/2026',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      downstreams: [SEND_DOWNSTREAMS.ADE],
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'downstream-ade-500-verifica-legale-rappresentante',
    description: 'Agenzia Entrate non disponibile durante verifica legale rappresentante',
    priority: 110,
    condition: stepEvidenceMatches(
      'query-pn-national-registries',
      '\\[DOWNSTREAM\\] Service AdE returned errors=500 Internal Server Error from POST https://gatewaywebservices\\.agenziaentrate\\.it/SPCBooleanoRappWS/VerificaRappresentanteEnteService',
    ),
    title: '[DOWNSTREAM] Service AdE returned errors=500 Internal Server Error',
    resolution: 'Thread Slack 23/04/2026',
    details: [['Downstream', 'AdE']],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      downstreams: [SEND_DOWNSTREAMS.ADE],
      links: [],
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
    resolution: 'Risoluzione non documentata.',
    details: [
      ['Endpoint', '{{vars.apiGwHttpMethod}} {{vars.apiGwPath}}'],
      ['Status Code', '{{vars.apiGwStatusCode}}'],
      ['Error', '{{vars.apiGwErrorMessage}}'],
      ['Downstream', 'AdE'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      downstreams: [SEND_DOWNSTREAMS.ADE],
      links: [],
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
    resolution: 'Risoluzione non documentata.',
    details: [
      ['Endpoint', '{{vars.apiGwHttpMethod}} {{vars.apiGwPath}}'],
      ['Status Code', '{{vars.apiGwStatusCode}}'],
      ['Error', '{{vars.apiGwErrorMessage}}'],
      ['Downstream', 'AdE'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [],
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
    resolution: 'Risoluzione non documentata.',
    details: [
      ['Endpoint', '{{vars.apiGwHttpMethod}} {{vars.apiGwPath}}'],
      ['Status Code', '{{vars.apiGwStatusCode}}'],
      ['Downstream', 'InfoCamere'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      errorDetails: 'ReadTimeoutException durante la chiamata POST verso l’endpoint di autenticazione InfoCamere.',
      downstreams: [SEND_DOWNSTREAMS.INFOCAMERE],
      links: [],
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
    resolution: 'Risoluzione non documentata.',
    details: [
      ['Endpoint', '{{vars.apiGwHttpMethod}} {{vars.apiGwPath}}'],
      ['Status Code', '{{vars.apiGwStatusCode}}'],
      ['Downstream', 'InfoCamere'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      errorDetails: 'Connessione verso InfoCamere interrotta dal peer remoto durante l’autenticazione.',
      downstreams: [SEND_DOWNSTREAMS.INFOCAMERE],
      links: [],
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
    resolution:
      'Scenario di errore gi\u00E0 noto e dipendente da una problematica del downstream Infocamere gi\u00E0 segnalata. Si sta cercando di ovviare a questo problema implementando un meccanismo di retry. Thread Slack 02/10/2026 (CF oscurati) Thread Slack 30/09/2025',
    details: [['Downstream', 'InfoCamere']],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      downstreams: [SEND_DOWNSTREAMS.INFOCAMERE],
      links: [],
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
    resolution: 'Risoluzione non documentata.',
    details: [['Downstream', 'InfoCamere']],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      downstreams: [SEND_DOWNSTREAMS.INFOCAMERE],
      links: [],
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
    resolution: 'Nessuna azione necessaria',
    details: [
      ['Endpoint', '{{vars.apiGwHttpMethod}} {{vars.apiGwPath}}'],
      ['Status Code', '{{vars.apiGwStatusCode}}'],
      ['Error', '{{vars.apiGwErrorMessage}}'],
      ['Downstream', 'INAD/InfoCamere'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'apigw-504-timeout',
    description: 'API Gateway 504 per timeout di risposta dal backend',
    priority: 100,
    condition: all(apiGwStatusIs('504'), varMatches('apiGwErrorMessage', 'Execution failed due to a timeout error')),
    title: 'API Gateway 504 - Execution failed due to a timeout error',
    resolution: 'Nessuna azione necessaria',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [],
    },
  }),
];
