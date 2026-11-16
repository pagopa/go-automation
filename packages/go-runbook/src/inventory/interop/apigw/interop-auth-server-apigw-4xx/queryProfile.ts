import { interop } from '../../../../toolkits/interop/index.js';

/**
 * Warnings of the authorization server that never explain a 4xx: a client
 * sending invalid claims is the client's problem (EVO-RBREORG-OPUS-01 P18).
 */
const NON_CAUSAL_WARNINGS: ReadonlyArray<string> = ['Invalid claims in client assertion payload'];

/** 4xx on the API Gateway, aggregated warning scan on the authorization server behind it. */
export const AUTH_SERVER_4XX_QUERY_PROFILE: interop.apigw.InteropApiGwQueryProfile = {
  errorFamilyLabel: '4xx',
  apiGwQueryProfileId: 'interop-api-gateway-auth-server-4xx',
  apiGwQueryKind: 'interop-api-gateway-auth-server-4xx-aggregate',
  buildApiGwAggregateQuery: (apiGwId) => interop.apigw.buildInteropApiGwStatusAggregateQuery(apiGwId, 4),
  applicationLogsQueryProfileId: 'interop-k8s-auth-server-warnings',
  buildApplicationLogsQuery: (podApp) =>
    interop.apigw.buildInteropApiGwServiceWarningsQuery(podApp, NON_CAUSAL_WARNINGS),
};
