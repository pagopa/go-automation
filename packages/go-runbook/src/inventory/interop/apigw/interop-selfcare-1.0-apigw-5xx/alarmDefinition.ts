import { interop, type InteropApiGwAlarm } from '../../../../toolkits/interop/index.js';

/**
 * Everything the runbook, its known cases and the registry need about the
 * INTEROP Selfcare API Gateway alarm. The environment sits in the middle of the alarm name.
 */
export const SELFCARE_ALARM: InteropApiGwAlarm = interop.apigw.defineInteropApiGwAlarm({
  runbookKey: 'interop-selfcare-1.0-apigw-5xx',
  serviceName: 'interop-be-backend-for-frontend',
  varPrefix: 'interopBff',
  /** Profile advertised in `runbookContext`; describes this runbook. */
  apiGwProfileId: 'interop-api-gateway-bff-5xx',
  apiGwIds: { prod: 'tf9isbi4pi', att: '5sfghk09qb', test: 'an24tfmqw3' },
  alarmName: (environment) => `interop-selfcare-1.0-${environment}-apigw-5xx`,
});
