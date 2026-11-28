import { all, type KnownError, stepEvidenceMatches, varEquals, varMatches } from '../../../../engine/index.js';
import {
  downstreamMarkerPattern,
  apiGwPathMatches,
  apiGwStatusIs,
  knownError,
  SEND_DOWNSTREAMS,
} from '../../../../toolkits/send/index.js';
/**
 * Known errors for the pn-national-registries-PNPG-ApiGwAlarm runbook,
 * evaluated against the resulting context in declaration order.
 */
export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  knownError({
    code: 'SEND_APIGW_PNRPNPGAGA_API-504-LEG-INS-COM-OBS',
    description: 'API Gateway 504 con completamento applicativo legal-institutions nello stesso trace',
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
  knownError({
    code: 'SEND_APIGW_PNRPNPGAGA_DOW-INA-CON-TIM',
    description: 'Timeout di connessione verso INAD',
    condition: stepEvidenceMatches(
      'query-pn-national-registries',
      `${downstreamMarkerPattern('INAD')}connection timed out after [0-9]+ ms: api\\.inad\\.gov\\.it`,
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
  knownError({
    code: 'SEND_APIGW_PNRPNPGAGA_DOW-ADE-CON-TIM',
    description: 'Timeout di connessione verso Agenzia Entrate',
    condition: stepEvidenceMatches(
      'query-pn-national-registries',
      `${downstreamMarkerPattern('AdE')}connection timed out after [0-9]+ ms: gatewaywebservices\\.agenziaentrate\\.it`,
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
  knownError({
    code: 'SEND_APIGW_PNRPNPGAGA_DOW-ADE-500-VER-LEG-RAP',
    description: 'Agenzia Entrate non disponibile durante verifica legale rappresentante',
    condition: stepEvidenceMatches(
      'query-pn-national-registries',
      downstreamMarkerPattern('AdE', {
        status: '500 Internal Server Error',
        method: 'POST',
        endpoint: 'https://gatewaywebservices.agenziaentrate.it/SPCBooleanoRappWS/VerificaRappresentanteEnteService',
      }),
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
  knownError({
    code: 'SEND_APIGW_PNRPNPGAGA_DOW-ADE-REA-TIM-VER-LEG-RAP',
    description: 'Timeout Agenzia Entrate durante verifica legale rappresentante',
    condition: all(
      apiGwStatusIs('504'),
      varMatches('apiGwErrorMessage', 'Endpoint request timed out'),
      apiGwPathMatches('^/national-registries-private/agenzia-entrate/legal$'),
      varEquals('nationalRegistriesNextUrlTarget', 'AdE'),
      stepEvidenceMatches(
        'query-pn-national-registries',
        `${downstreamMarkerPattern('AdE')}<not specified>.*Request to POST ` +
          'https://gatewaywebservices\\.agenziaentrate\\.it/SPCBooleanoRappWS/VerificaRappresentanteEnteService.*ReadTimeoutException',
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
  knownError({
    code: 'SEND_APIGW_PNRPNPGAGA_API-504-ADE-LEG-TIM-NO-SER-LOG',
    description: 'Timeout API Gateway su verifica legale rappresentante AdE senza log applicativi correlati',
    condition: all(
      apiGwStatusIs('504'),
      varEquals('nationalRegistriesLookupState', 'queried'),
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
  knownError({
    code: 'SEND_APIGW_PNRPNPGAGA_DOW-INF-REA-TIM-AUT',
    description: 'Timeout InfoCamere durante authentication',
    condition: stepEvidenceMatches(
      'query-pn-national-registries',
      `${downstreamMarkerPattern('InfoCamere')}<not specified>` +
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
  knownError({
    code: 'SEND_APIGW_PNRPNPGAGA_DOW-INF-CON-RES-AUT',
    description: 'Connessione InfoCamere chiusa durante authentication',
    condition: stepEvidenceMatches(
      'query-pn-national-registries',
      `${downstreamMarkerPattern('InfoCamere')}recvAddress\\(\\.\\.\\) failed: Connection reset by peer` +
        '[\\s\\S]*Request to POST ' +
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
  knownError({
    code: 'SEND_APIGW_PNRPNPGAGA_DOW-INF-500-ELE-LEG-RAP',
    description: 'InfoCamere non disponibile durante elenco legale rappresentante',
    condition: stepEvidenceMatches(
      'query-pn-national-registries',
      downstreamMarkerPattern('InfoCamere', {
        status: '500 Internal Server Error',
        method: 'GET',
        endpoint: 'https://icapis.infocamere.it/ic/pe/wspa/wspa/rest/listaLegaleRappresentante/',
      }),
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
  knownError({
    code: 'SEND_APIGW_PNRPNPGAGA_DOW-INF-500-AUT',
    description: 'InfoCamere non disponibile durante authentication',
    condition: stepEvidenceMatches(
      'query-pn-national-registries',
      `${downstreamMarkerPattern('InfoCamere', {
        status: '500 Internal Server Error',
        method: 'POST',
        endpoint: 'https://icapis.infocamere.it/ic/pe/wspa/wspa/rest/authentication',
      })}(?:\\?client_id=[^\\s"]*)?`,
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
  knownError({
    code: 'SEND_APIGW_PNRPNPGAGA_API-504-INF-INA-TIM',
    description: 'Timeout API Gateway su legal-institutions per tempi risposta INAD/InfoCamere',
    condition: all(
      apiGwStatusIs('504'),
      varEquals('nationalRegistriesLookupState', 'queried'),
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
  knownError({
    code: 'SEND_APIGW_PNRPNPGAGA_API-504-TIM',
    description: 'API Gateway 504 per timeout di risposta dal backend',
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
