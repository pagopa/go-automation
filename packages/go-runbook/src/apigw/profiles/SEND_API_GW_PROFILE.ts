import type { ApiGwQueryProfile } from './ApiGwQueryProfile.js';

/**
 * Query AccessLog SEND. Riproduce esattamente il template canonico
 * precedentemente in `apigw/queries/DEFAULT_API_GW_QUERY.ts`.
 *
 * I campi di stato principali e authorizer sono scansionati in OR perché
 * un'autorizzazione fallita o un'integrazione downstream rotta possono
 * lasciare `status='-'` ma comunque costituire un errore.
 */
const SEND_ACCESS_LOG_QUERY = `filter status >= {{minStatusCode}} or authorizerStatus >= {{minStatusCode}} or integrationServiceStatus >= {{minStatusCode}}
| sort @timestamp asc
| display @timestamp, xrayTraceId, requestId, authorizerRequestId, integrationRequestId, errorMessage, httpMethod, path, authorizerStatus, authorizerLatency, integrationServiceStatus, status`;

/**
 * Template della query sui log applicativi SEND. Riproduce esattamente
 * `apigw/queries/DEFAULT_SERVICE_QUERY_TEMPLATE.ts`.
 *
 * Il `{{FILTER_CLAUSE}}` viene popolato a runtime con un predicate
 * `@message like '<value>'` (vedi `tracePredicateTemplate` /
 * `fallbackPredicateTemplate` sotto).
 */
const SEND_SERVICE_LOG_QUERY_TEMPLATE = `{{FILTER_CLAUSE}}
| filter level == 'ERROR'
| display @timestamp, level, ms, @message, trace_id`;

/**
 * Template della query sugli execution log API Gateway SEND.
 *
 * V04: il `{{REQUEST_ID_FILTER_CLAUSE}}` viene popolato con una clausola
 * OR-combinata su tutti i requestId estratti dall'AccessLog, in modo da
 * fare UNA sola chiamata AWS invece di N (una per requestId) come nella
 * versione pre-refactor.
 */
const SEND_EXECUTION_LOG_QUERY_TEMPLATE = `{{REQUEST_ID_FILTER_CLAUSE}}
| sort @timestamp asc
| display @timestamp, @message`;

/**
 * Profilo canonico per i runbook di prodotto SEND.
 *
 * - AccessLog: query SEND con status field e display SEND-specifico
 * - ServiceLog: query con `level == 'ERROR'` sui log applicativi pn-*
 * - ExecutionLog: query OR-combinata per requestId sull'execution log
 *   API GW REST, limite 50 requestId per query
 * - Authorizer gate: capability dichiarata nello schema; e' cablata solo
 *   dai runbook che valorizzano `authorizerFailureCheck`
 *
 * Il trace id SEND è X-Ray, leggibile dal campo `xrayTraceId` in formato
 * `Root=<value>`. La var di contesto resta `xRayTraceId` per back-compat
 * con i knownCases SEND esistenti.
 */
export const SEND_API_GW_PROFILE: ApiGwQueryProfile = {
  id: 'send',
  accessLog: {
    query: SEND_ACCESS_LOG_QUERY,
    schema: {
      statusFields: ['status', 'authorizerStatus', 'integrationServiceStatus'],
      traceIdField: 'xrayTraceId',
      traceIdLabel: 'X-Ray Trace ID',
      traceIdContextVar: 'xRayTraceId',
      traceIdExtractPattern: 'Root=([^\\s]+)',
      errorMessageField: 'errorMessage',
      pathField: 'path',
      httpMethodField: 'httpMethod',
      requestIdField: 'requestId',
      fieldToVar: [
        ['errorMessage', 'apiGwErrorMessage'],
        ['httpMethod', 'apiGwHttpMethod'],
        ['path', 'apiGwPath'],
        ['authorizerStatus', 'apiGwAuthorizerStatus'],
        ['authorizerLatency', 'apiGwAuthorizerLatency'],
        ['authorizerRequestId', 'apiGwAuthorizerRequestId'],
        ['integrationServiceStatus', 'apiGwIntegrationServiceStatus'],
        ['requestId', 'apiGwRequestId'],
        ['integrationRequestId', 'apiGwIntegrationRequestId'],
      ],
      notApplicableSentinels: ['-'],
      authorizer: {
        statusFields: ['authorizerStatus'],
        latencyFields: ['authorizerLatency'],
        requestIdFields: ['authorizerRequestId'],
      },
    },
  },
  serviceLog: {
    queryTemplate: SEND_SERVICE_LOG_QUERY_TEMPLATE,
    tracePredicateTemplate: `@message like '{{VALUE}}'`,
    fallbackPredicateTemplate: `@message like '{{VALUE}}'`,
    schema: {
      messageFieldCandidates: ['message', '@message'],
      levelField: 'level',
      traceIdField: 'trace_id',
    },
  },
  executionLog: {
    queryTemplate: SEND_EXECUTION_LOG_QUERY_TEMPLATE,
    requestIdPredicateTemplate: `@message like '{{VALUE}}'`,
    maxRequestIds: 50,
  },
};
