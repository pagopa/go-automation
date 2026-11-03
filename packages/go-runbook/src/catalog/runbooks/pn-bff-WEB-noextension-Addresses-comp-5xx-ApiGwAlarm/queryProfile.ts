import { SEND_API_GW_PROFILE } from '../../../apigw/profiles/SEND_API_GW_PROFILE.js';
import type { ApiGwQueryProfile } from '../../../apigw/profiles/ApiGwQueryProfile.js';

// Verified child alarm: GET addresses, POST/DELETE one address. Public paths may include /bff.
const ADDRESSES_SCOPE_FILTER = `filter (
  httpMethod = 'GET' and (
    resourcePath = '/v1/addresses'
    or (not ispresent(resourcePath) and path like /^\\/(bff\\/)?v1\\/addresses$/)
  )
) or (
  httpMethod in ['POST', 'DELETE'] and (
    resourcePath = '/v1/addresses/{addressType}/{senderId}/{channelType}'
    or (not ispresent(resourcePath) and path like /^\\/(bff\\/)?v1\\/addresses\\/[^\\/]+\\/[^\\/]+\\/[^\\/]+$/)
  )
)`;

/** Keep outgoing calls and trace fields, including non-error rows needed for correlation. */
export const ADDRESSES_QUERY_PROFILE: ApiGwQueryProfile = {
  ...SEND_API_GW_PROFILE,
  id: 'send-bff-addresses',
  accessLog: {
    ...SEND_API_GW_PROFILE.accessLog,
    query: `${ADDRESSES_SCOPE_FILTER}
| ${SEND_API_GW_PROFILE.accessLog.query}`,
  },
  serviceLog: {
    ...SEND_API_GW_PROFILE.serviceLog,
    queryTemplate: `{{FILTER_CLAUSE}}
| sort @timestamp asc
| limit 1000
| display @timestamp, level, message, @message, trace_id, \`AWS-XRAY-TRACE-ID\``,
  },
};
