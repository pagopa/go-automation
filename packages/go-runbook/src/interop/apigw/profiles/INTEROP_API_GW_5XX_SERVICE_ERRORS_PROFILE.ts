import { buildInteropApiGwStatusAggregateQuery } from '../queries/buildInteropApiGwStatusAggregateQuery.js';
import { buildInteropApiGwServiceErrorsQuery } from '../queries/interopApiGwApplicationQueries.js';
import type { InteropApiGwQueryProfile } from './InteropApiGwQueryProfile.js';

/** 5xx on the API Gateway, error scan on the service behind it. */
export const INTEROP_API_GW_5XX_SERVICE_ERRORS_PROFILE: InteropApiGwQueryProfile = {
  id: 'interop-api-gateway-5xx-service-errors',
  errorFamilyLabel: '5xx',
  apiGwQueryProfileId: 'interop-api-gateway-access-log-5xx',
  apiGwQueryKind: 'interop-api-gateway-5xx-aggregate',
  buildApiGwAggregateQuery: (apiGwId) => buildInteropApiGwStatusAggregateQuery(apiGwId, 5),
  applicationLogsQueryProfileId: 'interop-k8s-bff-5xx',
  buildApplicationLogsQuery: buildInteropApiGwServiceErrorsQuery,
};
