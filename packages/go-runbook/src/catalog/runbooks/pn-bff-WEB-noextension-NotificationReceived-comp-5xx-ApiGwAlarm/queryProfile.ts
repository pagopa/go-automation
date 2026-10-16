import { SEND_API_GW_PROFILE } from '../../../apigw/profiles/SEND_API_GW_PROFILE.js';
import type { ApiGwQueryProfile } from '../../../apigw/profiles/ApiGwQueryProfile.js';

// Operations verified against the NotificationReceived child alarm in production.
const SCOPE = `filter (
  httpMethod = 'GET' and (
    resourcePath in [
      '/v1/notifications/received',
      '/v1/notifications/received/delegated',
      '/v1/notifications/received/{iun}',
      '/v1/notifications/received/{iun}/timeline',
      '/v1/notifications/received/{iun}/documents/{documentType}',
      '/v1/notifications/received/{iun}/payments/{attachmentName}',
      '/v1/notifications/received/check-tpp'
    ] or (
      (not ispresent(resourcePath) or resourcePath = '-') and
      path like /^\\/(?:bff\\/)?v1\\/notifications\\/received(?:\\/[^\\/]+(?:\\/(?:timeline|documents\\/[^\\/]+|payments\\/[^\\/]+))?)?$/ and path not like /\\/check-aar-qr-code$/
    )
  )
) or (
  httpMethod = 'POST' and (
    resourcePath = '/v1/notifications/received/check-aar-qr-code' or (
      (not ispresent(resourcePath) or resourcePath = '-') and
      path like /^\\/(?:bff\\/)?v1\\/notifications\\/received\\/check-aar-qr-code$/
    )
  )
)`;

export const NOTIFICATION_RECEIVED_QUERY_PROFILE: ApiGwQueryProfile = {
  ...SEND_API_GW_PROFILE,
  id: 'send-notification-received-web',
  accessLog: {
    ...SEND_API_GW_PROFILE.accessLog,
    query: `${SCOPE}\n| ${SEND_API_GW_PROFILE.accessLog.query}`,
  },
};
