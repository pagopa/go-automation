import { interop, type InteropApiGwAlarm } from '../../../../toolkits/interop/index.js';

import { AUTH_SERVER_API_GW_IDS } from '../../shared/AUTH_SERVER_API_GW_IDS.js';

/** Confluence page 2111078419 cases, extended to the auth-server gateways in prod, att and test. */
export const AUTH_SERVER_5XX_ALARM: InteropApiGwAlarm = interop.apigw.defineInteropApiGwAlarm({
  runbookKey: 'interop-auth-server-apigw-5xx',
  serviceName: 'interop-be-authorization-server-node',
  podAppFilter: 'interop-be-authorization-server',
  varPrefix: 'interopAuthServer',
  apiGwProfileId: 'interop-api-gateway-auth-server-5xx',
  apiGwIds: AUTH_SERVER_API_GW_IDS,
  alarmName: (environment) => `interop-auth-server-${environment}-apigw-5xx`,
});
