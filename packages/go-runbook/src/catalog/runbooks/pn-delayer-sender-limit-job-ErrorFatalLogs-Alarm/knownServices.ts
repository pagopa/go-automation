import type { service } from '../framework.js';

/**
 * The source query searches ERROR lines and retains both parsed and raw messages.
 *
 * `limit` comes after `dedup`, the only command Insights allows there: placed
 * before it, it would cap the *input* to the de-duplication at 1,000 raw lines,
 * so a distinct error first logged after the thousandth line of a burst would
 * never reach the operator. Bounding the distinct rows instead matches what the
 * page's query does over the whole window.
 */
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
