import { interop, type InteropApiGwAlarm } from '../../../../toolkits/interop/index.js';

export const INTEROP_API_V2_5XX_ALARM: InteropApiGwAlarm = interop.apigw.defineInteropApiGwAlarm({
  runbookKey: 'interop-api-v2-apigw-5xx',
  serviceName: 'interop-be-m2m-gateway',
  varPrefix: 'interopM2mGateway',
  apiGwProfileId: 'interop-api-gateway-m2m-v2-5xx',
  apiGwIds: { prod: 'rudgz28tel', test: 'jrafz6h9c9', att: 'c786nyh6f4' },
  alarmName: (environment) => `interop-api-v2-${environment}-apigw-5xx`,
});
