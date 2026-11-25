import { interop, type InteropApiGwAlarm } from '../../../../toolkits/interop/index.js';

export const INTEROP_API_V3_5XX_ALARM: InteropApiGwAlarm = interop.apigw.defineInteropApiGwAlarm({
  runbookKey: 'interop-api-v3-apigw-5xx',
  serviceName: 'interop-be-m2m-gateway-v3',
  varPrefix: 'interopM2mGatewayV3',
  apiGwProfileId: 'interop-api-gateway-m2m-v3-5xx',
  apiGwIds: { prod: 'zafza38l7f', test: '9g5qf4liy0', att: '7bms2hjt39' },
  alarmName: (environment) => `interop-api-v3-${environment}-apigw-5xx`,
});
