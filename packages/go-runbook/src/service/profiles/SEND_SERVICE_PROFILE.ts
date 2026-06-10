import type { ServiceLogQueryProfile } from './ServiceLogQueryProfile.js';

const SEND_SERVICE_ERROR_QUERY = `filter level = 'ERROR'
| sort @timestamp asc
| limit 1000
| display @timestamp, level, ms, @message, trace_id`;

const SEND_SERVICE_TRACE_QUERY_TEMPLATE = `filter @message like '{{TRACE_ID}}'
| sort @timestamp asc
| limit 1000
| display @timestamp, level, ms, @message, trace_id`;

/**
 * Profilo canonico per log applicativi SEND su ECS.
 */
export const SEND_SERVICE_PROFILE: ServiceLogQueryProfile = {
  id: 'send-service',
  errorQuery: SEND_SERVICE_ERROR_QUERY,
  traceQueryTemplate: SEND_SERVICE_TRACE_QUERY_TEMPLATE,
  schema: {
    messageFieldCandidates: ['message', '@message'],
    levelField: 'level',
    traceIdField: 'trace_id',
  },
};
