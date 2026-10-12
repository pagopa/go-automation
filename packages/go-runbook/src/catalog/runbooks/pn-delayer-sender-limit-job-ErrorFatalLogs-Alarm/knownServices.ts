import type { service } from '../framework.js';

/** Limit distinct ERROR messages after deduplication, preserving the raw log. */
export const DELAYER_ERROR_QUERY = `filter @message like 'ERROR'
| sort @timestamp asc
| display @timestamp, trace_id, message, @message
| dedup message
| limit 1000`;

export const SERVICE: service.ServiceDescriptor = {
  name: 'pn-delayer-sender-limit-job',
  varPrefix: 'delayerSenderLimitJob',
  logGroup: '/aws/ecs/pn-delayer-sender-limit-job',
  queryOverride: DELAYER_ERROR_QUERY,
};
