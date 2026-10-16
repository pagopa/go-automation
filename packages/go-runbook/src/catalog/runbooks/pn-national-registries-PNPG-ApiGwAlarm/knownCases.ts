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
  'Correlare l’errore InfoCamere con trace e risposta API Gateway. Verificare connettività, latenza e stato del servizio ' +
  'senza attribuire automaticamente la causa al sistema remoto. Verificare richieste successive sullo stesso endpoint; ' +
  'se il problema persiste o manca evidenza di ripresa, mantenere aperta l’analisi e coinvolgere il team prodotto.';
const FOLLOW_UP_FINAL_ACTION =
  'Verificare richieste successive e coinvolgere il team prodotto se il problema persiste o la causa non è confermata';

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
    resolution:
      'Lo stesso trace contiene il completamento del controllo applicativo legal-institutions, pur con un 504 API Gateway. ' +
      'Confrontare gli orari di avvio e completamento e la latenza del gateway: una risposta remota o un completamento ' +
      'successivo non dimostrano che il chiamante abbia ricevuto un esito positivo. Verificare richieste successive ' +
      'e coinvolgere il team prodotto se l’attesa elevata persiste; non attribuire il timeout a INAD senza evidenze correlate.',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [FOLLOW_UP_FINAL_ACTION],
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
      'Correlare trace e risposta API Gateway; il timeout di connessione non identifica da solo la causa remota. ' +
      'Verificare connettività, DNS, risorse del servizio e richieste successive. Segnalare al team prodotto ' +
      'se ricorre in un intervallo ristretto, persiste o manca evidenza di ripresa.',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      downstreams: [SEND_DOWNSTREAMS.INAD],
      finalActions: [FOLLOW_UP_FINAL_ACTION],
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
    resolution:
      'Correlare trace e risposta API Gateway; verificare connettività, DNS, latenza e risorse del servizio. ' +
      'Consultare la segnalazione storica senza assumerla come causa attuale. Verificare richieste successive ' +
      'e coinvolgere il team prodotto se il problema persiste o la ripresa non è confermata.',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      downstreams: [SEND_DOWNSTREAMS.ADE],
      finalActions: [FOLLOW_UP_FINAL_ACTION],
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
    resolution:
      'Correlare il 500 AdE con trace e risposta API Gateway. Verificare persistenza, impatto e richieste successive ' +
      'sullo stesso endpoint; coinvolgere il team prodotto se il problema persiste o manca evidenza di ripresa.',
    details: [['Downstream', 'AdE']],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [FOLLOW_UP_FINAL_ACTION],
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
      'Il log documenta una ReadTimeoutException durante la chiamata AdE. Correlare trace e risposta 504, ' +
      'verificare rete, latenza e stato del servizio e confrontare richieste successive. Mantenere aperta l’analisi ' +
      'se il problema persiste o la ripresa non è confermata; coinvolgere il team prodotto.',
    details: [
      ['Endpoint', '{{vars.apiGwHttpMethod}} {{vars.apiGwPath}}'],
      ['Status Code', '{{vars.apiGwStatusCode}}'],
      ['Error', '{{vars.apiGwErrorMessage}}'],
      ['Downstream', 'AdE'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [FOLLOW_UP_FINAL_ACTION],
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
      'Il 504 prova la scadenza dell’attesa del gateway sul percorso AdE, non un disservizio AdE accertato. ' +
      'Se mancano log correlati, verificare account, regione, trace, intervallo, permessi, ingestione e retention; ' +
      'analizzare latenza e risorse del backend e richieste successive. Non chiudere sulla sola assenza di log o sullo stato OK.',
    details: [
      ['Endpoint', '{{vars.apiGwHttpMethod}} {{vars.apiGwPath}}'],
      ['Status Code', '{{vars.apiGwStatusCode}}'],
      ['Error', '{{vars.apiGwErrorMessage}}'],
      ['Downstream', 'AdE'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [FOLLOW_UP_FINAL_ACTION],
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
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [FOLLOW_UP_FINAL_ACTION],
      errorDetails: 'ReadTimeoutException durante la chiamata POST verso l’endpoint di autenticazione InfoCamere.',
      downstreams: [SEND_DOWNSTREAMS.INFOCAMERE],
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
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [FOLLOW_UP_FINAL_ACTION],
      errorDetails: 'Connessione verso InfoCamere interrotta dal peer remoto durante l’autenticazione.',
      downstreams: [SEND_DOWNSTREAMS.INFOCAMERE],
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
      'Correlare il 500 di listaLegaleRappresentante con trace e risposta API Gateway; consultare la segnalazione ' +
      'storica senza considerarla prova della causa attuale. Verificare persistenza e richieste successive ' +
      'e coinvolgere il team prodotto se necessario. Oscurare codici fiscali, identificativi e query string nelle evidenze.',
    details: [['Downstream', 'InfoCamere']],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [FOLLOW_UP_FINAL_ACTION],
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
    resolution:
      'Correlare il 500 di autenticazione InfoCamere con trace e risposta API Gateway. Verificare persistenza, ' +
      'errori di accesso e richieste successive senza esporre credenziali o query string. ' +
      'Coinvolgere il team prodotto se il problema persiste o la ripresa non è dimostrata.',
    details: [['Downstream', 'InfoCamere']],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [FOLLOW_UP_FINAL_ACTION],
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
      'Il 504 sul percorso legal-institutions documenta una scadenza dell’attesa del gateway; ' +
      'non identifica da solo INAD o InfoCamere come causa. Verificare trace e log applicativi, account, intervallo, ' +
      'permessi, ingestione e retention; confrontare latenza, CPU/memoria e richieste successive. ' +
      'Un allarme di latenza nella stessa finestra è un indizio da correlare, non una prova della causa. ' +
      'Mantenere aperta l’analisi se la causa o la ripresa non sono confermate.',
    details: [
      ['Endpoint', '{{vars.apiGwHttpMethod}} {{vars.apiGwPath}}'],
      ['Status Code', '{{vars.apiGwStatusCode}}'],
      ['Error', '{{vars.apiGwErrorMessage}}'],
      ['Downstream', 'INAD/InfoCamere'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [FOLLOW_UP_FINAL_ACTION],
    },
  }),
  knownCase({
    id: 'apigw-504-timeout',
    description: 'API Gateway 504 per timeout di risposta dal backend',
    priority: 100,
    condition: all(apiGwStatusIs('504'), varMatches('apiGwErrorMessage', 'Execution failed due to a timeout error')),
    title: 'API Gateway 504 - Execution failed due to a timeout error',
    resolution:
      'Il gateway ha terminato l’attesa del backend. Correlare trace e log applicativi, verificare latenza, ' +
      'CPU/memoria, errori di accesso e richieste successive sullo stesso endpoint. Il messaggio non dimostra ' +
      'che l’errore sia transitorio o risolto: mantenere aperta l’analisi finché causa e impatto non sono chiariti.',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [FOLLOW_UP_FINAL_ACTION],
    },
  }),
];
