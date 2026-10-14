import { SEND_API_GW_PROFILE } from '../../../apigw/profiles/SEND_API_GW_PROFILE.js';
import type { ApiGwQueryProfile } from '../../../apigw/profiles/ApiGwQueryProfile.js';

// Verified against the child alarm and REST API on 2026-10-13.
// resourcePath excludes the public /bff prefix. Older rows may only have path.
const INFO_PA_SCOPE_FILTER = `filter (
    httpMethod = 'GET' and (
      resourcePath in ['/v1/institutions', '/v1/institutions/products', '/v1/pa/groups', '/v1/pa/additional-languages']
      or (not ispresent(resourcePath) and path like /\\/v1\\/(institutions(\\/products)?|pa\\/(groups|additional-languages))$/)
    )
  ) or (
    httpMethod = 'PUT' and (
      resourcePath = '/v1/pa/additional-languages'
      or (not ispresent(resourcePath) and path like /\\/v1\\/pa\\/additional-languages$/)
    )
  )`;

export const INFO_PA_QUERY_PROFILE: ApiGwQueryProfile = {
  ...SEND_API_GW_PROFILE,
  accessLog: {
    ...SEND_API_GW_PROFILE.accessLog,
    query: `${INFO_PA_SCOPE_FILTER}
| ${SEND_API_GW_PROFILE.accessLog.query}`,
  },
};
