import { interop, type InteropApiGwAlarm } from '../../../../toolkits/interop/index.js';

import { AUTH_SERVER_API_GW_IDS } from '../../shared/AUTH_SERVER_API_GW_IDS.js';

/**
 * Everything the runbook, its known cases and the registry need about the
 * INTEROP auth-server API Gateway alarm.
 *
 * The low-request variant exists only in att and test, so it is declared as an
 * additional alarm: `…-prod-apigw-4xx-low-requests` does not exist and is rejected.
 */
export const AUTH_SERVER_ALARM: InteropApiGwAlarm = interop.apigw.defineInteropApiGwAlarm({
  runbookKey: 'interop-auth-server-apigw-4xx',
  serviceName: 'interop-be-authorization-server-node',
  /** The pods are named `…-node` but the query filter matches the broader family. */
  podAppFilter: 'interop-be-authorization-server',
  varPrefix: 'interopAuthServer',
  /** Profile advertised in `runbookContext`; describes this runbook. */
  apiGwProfileId: 'interop-api-gateway-auth-server-4xx',
  apiGwIds: AUTH_SERVER_API_GW_IDS,
  alarmName: (environment) => `interop-auth-server-${environment}-apigw-4xx`,
  additionalAlarms: [
    { name: 'interop-auth-server-att-apigw-4xx-low-requests', environment: 'att' },
    { name: 'interop-auth-server-test-apigw-4xx-low-requests', environment: 'test' },
  ],
});
