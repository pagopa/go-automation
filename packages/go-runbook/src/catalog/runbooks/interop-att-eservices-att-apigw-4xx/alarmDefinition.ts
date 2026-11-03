/** Verified Confluence source, AWS alarm and REST API resources in Attestazione. */
export const ALARM_NAME = 'interop-att-eservices-att-apigw-4xx';
export const API_GW_ID = '6iyn5o8ge4';
const API_GW_NAME = 'interop-att-eservices-att';
export const API_GW_RESOURCE_NAME: string = `${API_GW_NAME} (${API_GW_ID})`;
export const API_GW_LOG_GROUP = 'amazon-apigateway-interop-att-eservices-access-logs-att';
export const QUERY_STEP_ID = 'query-att-eservices-access-logs';
export const ANALYSIS_STEP_ID = 'analyze-att-eservices-access-logs';
export const ACCESS_LOG_RESULT_LIMIT = 1000;

/** Exact GET paths in the verified 2026-10-29 report; no method exists for these in the API snapshot. */
export const DOCUMENTED_PROBE_PATHS: ReadonlySet<string> = new Set([
  '/',
  '/favicon.ico',
  '/sitemap.xml',
  '/robots.txt',
  '/h/viewimages',
  '/h/printconversations',
  '/h/printtasks',
  '/h/printappointments',
  '/h/printmessage',
  '/h/printcontacts',
]);

export const ACCESS_LOG_QUERY: string = `filter apigwId = "${API_GW_ID}"
| filter status >= 400 and status < 500
| sort @timestamp asc
| limit ${String(ACCESS_LOG_RESULT_LIMIT)}
| display @timestamp, apigwId, status, integrationStatus, integrationError, errorMessage, errorType, authorizerStatus, httpMethod, requestPath, requestId
`;
