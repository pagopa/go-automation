import type { apigw } from '../framework.js';

export const API_GW_LOG_GROUP =
  'pn-bff-microsvc-prod-BffMicroservicePublicWebAPI-8Y6ZXNO6NRW5-PublicApiLogGroup-WgESVfe1onxD';

// Keep outgoing invocations, WARNs and response-commit evidence as well as errors.
const SERVICE_QUERY = `{{FILTER_CLAUSE}}
| sort @timestamp asc
| limit 1000
| display @timestamp, level, @message, trace_id, \`AWS-XRAY-TRACE-ID\``;

export const ENTRY_SERVICE: apigw.ApiGwService = {
  name: 'pn-bff',
  varPrefix: 'bff',
  logGroup: '/aws/ecs/pn-bff',
  executionLogGroup: 'API-Gateway-Execution-Logs_m93sy9txx7/unique',
  queryOverride: SERVICE_QUERY,
};

export const REACHABLE_SERVICES: ReadonlyArray<apigw.ApiGwService> = [
  {
    name: 'pn-external-registries',
    varPrefix: 'externalRegistries',
    logGroup: '/aws/ecs/pn-external-registries',
    queryOverride: SERVICE_QUERY,
  },
];
