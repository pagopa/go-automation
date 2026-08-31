import { buildInteropApiGwStatusAggregateQuery } from '../queries/buildInteropApiGwStatusAggregateQuery.js';
import { buildInteropApiGwServiceWarningsQuery } from '../queries/interopApiGwApplicationQueries.js';
import type { InteropApiGwQueryProfile } from './InteropApiGwQueryProfile.js';

/** 4xx on the API Gateway, aggregated warning scan on the service behind it. */
export const INTEROP_API_GW_4XX_SERVICE_WARNINGS_PROFILE: InteropApiGwQueryProfile = {
  id: 'interop-api-gateway-4xx-service-warnings',
  errorFamilyLabel: '4xx',
  apiGwQueryProfileId: 'interop-api-gateway-auth-server-4xx',
  apiGwQueryKind: 'interop-api-gateway-auth-server-4xx-aggregate',
  buildApiGwAggregateQuery: (apiGwId) => buildInteropApiGwStatusAggregateQuery(apiGwId, 4),
  applicationLogsQueryProfileId: 'interop-k8s-auth-server-warnings',
  buildApplicationLogsQuery: buildInteropApiGwServiceWarningsQuery,
};
