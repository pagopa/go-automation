/**
 * Known cases for the pn-national-registries-PNPG-ApiGwAlarm runbook.
 */

import type { KnownCase } from '@go-automation/go-runbook';

/**
 * Known cases evaluated against the resulting context, highest priority
 * first.
 */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  {
    id: 'downstream-ade-500-verifica-legale-rappresentante',
    description: 'Agenzia Entrate non disponibile durante verifica legale rappresentante',
    priority: 110,
    condition: {
      type: 'contains',
      ref: 'steps.query-pn-national-registries',
      regex:
        '\\[DOWNSTREAM\\] Service AdE returned errors=500 Internal Server Error from POST https://gatewaywebservices\\.agenziaentrate\\.it/SPCBooleanoRappWS/VerificaRappresentanteEnteService',
    },
    action: {
      type: 'log',
      level: 'info',
      message:
        '[CASO NOTO] [DOWNSTREAM] Service AdE returned errors=500 Internal Server Error\n' +
        'Risoluzione: Chiusura - caso noto. Downstream Agenzia Entrate in errore durante verifica legale rappresentante.\n' +
        'Downstream: AdE\n',
    },
  },
  {
    id: 'downstream-ade-read-timeout-verifica-legale-rappresentante',
    description: 'Timeout Agenzia Entrate durante verifica legale rappresentante',
    priority: 109,
    condition: {
      type: 'and',
      conditions: [
        { type: 'compare', ref: 'vars.apiGwStatusCode', operator: '==', value: '504' },
        { type: 'pattern', ref: 'vars.apiGwErrorMessage', regex: 'Endpoint request timed out' },
        {
          type: 'pattern',
          ref: 'vars.apiGwPath',
          regex: '^/national-registries-private/agenzia-entrate/legal$',
        },
        { type: 'compare', ref: 'vars.nationalRegistriesNextUrlTarget', operator: '==', value: 'AdE' },
        {
          type: 'contains',
          ref: 'steps.query-pn-national-registries',
          regex:
            '\\[DOWNSTREAM\\] Service AdE returned errors=<not specified>.*Request to POST https://gatewaywebservices\\.agenziaentrate\\.it/SPCBooleanoRappWS/VerificaRappresentanteEnteService.*ReadTimeoutException',
        },
      ],
    },
    action: {
      type: 'log',
      level: 'info',
      message:
        '[CASO NOTO] Timeout downstream AdE - VerificaRappresentanteEnteService\n' +
        'Risoluzione: Chiusura - caso noto. Richiesta scaduta per timeout verso Agenzia Entrate durante verifica legale rappresentante.\n' +
        'Endpoint: {{vars.apiGwHttpMethod}} {{vars.apiGwPath}}\n' +
        'Status Code: {{vars.apiGwStatusCode}}\n' +
        'Error: {{vars.apiGwErrorMessage}}\n' +
        'Downstream: AdE\n',
    },
  },
  {
    id: 'apigw-504-ade-legal-timeout-no-service-logs',
    description: 'Timeout API Gateway su verifica legale rappresentante AdE senza log applicativi correlati',
    priority: 108,
    condition: {
      type: 'and',
      conditions: [
        { type: 'compare', ref: 'vars.apiGwStatusCode', operator: '==', value: '504' },
        { type: 'compare', ref: 'vars.nationalRegistriesLogCount', operator: '==', value: '0' },
        { type: 'pattern', ref: 'vars.apiGwErrorMessage', regex: 'Endpoint request timed out' },
        { type: 'compare', ref: 'vars.apiGwHttpMethod', operator: '==', value: 'POST' },
        {
          type: 'pattern',
          ref: 'vars.apiGwPath',
          regex: '^/national-registries-private/agenzia-entrate/legal$',
        },
      ],
    },
    action: {
      type: 'log',
      level: 'info',
      message:
        '[CASO NOTO] API Gateway 504 - Endpoint request timed out su AdE legal\n' +
        'Risoluzione: Chiusura - caso noto. Timeout API Gateway durante verifica legale rappresentante verso Agenzia Entrate, senza log applicativi correlati nel servizio pn-national-registries.\n' +
        'Endpoint: {{vars.apiGwHttpMethod}} {{vars.apiGwPath}}\n' +
        'Status Code: {{vars.apiGwStatusCode}}\n' +
        'Error: {{vars.apiGwErrorMessage}}\n' +
        'Downstream: AdE\n',
    },
  },
  {
    id: 'downstream-infocamere-500-elenco-legale-rappresentante',
    description: 'InfoCamere non disponibile durante elenco legale rappresentante',
    priority: 105,
    condition: {
      type: 'contains',
      ref: 'steps.query-pn-national-registries',
      regex:
        '\\[DOWNSTREAM\\] Service InfoCamere returned errors=500 Internal Server Error from GET https://icapis\\.infocamere\\.it/ic/pe/wspa/wspa/rest/listaLegaleRappresentante/',
    },
    action: {
      type: 'log',
      level: 'info',
      message:
        '[CASO NOTO] [DOWNSTREAM] Service InfoCamere returned errors=500 Internal Server Error\n' +
        'Risoluzione: Chiusura - caso noto. Scenario dipendente da problematica del downstream InfoCamere gia segnalata.\n' +
        'Downstream: InfoCamere\n',
    },
  },
  {
    id: 'downstream-infocamere-500-authentication',
    description: 'InfoCamere non disponibile durante authentication',
    priority: 104,
    condition: {
      type: 'contains',
      ref: 'steps.query-pn-national-registries',
      regex:
        '\\[DOWNSTREAM\\] Service InfoCamere returned errors=500 Internal Server Error from POST https://icapis\\.infocamere\\.it/ic/pe/wspa/wspa/rest/authentication(?:\\?client_id=[^\\s"]*)?',
    },
    action: {
      type: 'log',
      level: 'info',
      message:
        '[CASO NOTO] [DOWNSTREAM] Service InfoCamere returned errors=500 Internal Server Error\n' +
        'Risoluzione: Chiusura - caso noto. Downstream InfoCamere in errore durante autenticazione.\n' +
        'Downstream: InfoCamere\n',
    },
  },
  {
    id: 'apigw-504-infocamere-inad-timeout',
    description: 'Timeout API Gateway su legal-institutions per tempi risposta INAD/InfoCamere',
    priority: 103,
    condition: {
      type: 'and',
      conditions: [
        { type: 'compare', ref: 'vars.apiGwStatusCode', operator: '==', value: '504' },
        { type: 'compare', ref: 'vars.nationalRegistriesLogCount', operator: '==', value: '0' },
        { type: 'pattern', ref: 'vars.apiGwErrorMessage', regex: 'Endpoint request timed out' },
        {
          type: 'pattern',
          ref: 'vars.apiGwPath',
          regex: '^/national-registries-private/infocamere/legal-institutions$',
        },
      ],
    },
    action: {
      type: 'log',
      level: 'info',
      message:
        '[CASO NOTO] API Gateway 504 - Endpoint request timed out su INAD/InfoCamere\n' +
        "Risoluzione: Chiusura - caso noto. Allarme scattato a causa di richieste scadute per timeout di attesa dal richiedente, a sua volta dovuto agli elevati tempi di risposta da parte di INAD/InfoCamere (v. analisi dell'oncall-pn-national-registries-PNPG-ApiGwLatencyAlarm).\n" +
        'Endpoint: {{vars.apiGwHttpMethod}} {{vars.apiGwPath}}\n' +
        'Status Code: {{vars.apiGwStatusCode}}\n' +
        'Error: {{vars.apiGwErrorMessage}}\n' +
        'Downstream: INAD/InfoCamere\n',
    },
  },
  {
    id: 'apigw-504-timeout',
    description: 'API Gateway 504 per timeout di risposta dal backend',
    priority: 100,
    condition: {
      type: 'and',
      conditions: [
        { type: 'compare', ref: 'vars.apiGwStatusCode', operator: '==', value: '504' },
        {
          type: 'pattern',
          ref: 'vars.apiGwErrorMessage',
          regex: 'Execution failed due to a timeout error',
        },
      ],
    },
    action: {
      type: 'log',
      level: 'info',
      message:
        '[CASO NOTO] API Gateway 504 - Execution failed due to a timeout error\n' +
        'Risoluzione: Nessuna azione necessaria. Timeout transitorio dovuto a ritardo di risposta del backend verso API Gateway.\n',
    },
  },
];
