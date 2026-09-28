import type { service } from '../framework.js';

/** The source query searches ERROR lines and retains both parsed and raw messages. */
export const DELAYER_ERROR_QUERY = `filter @message like 'ERROR'
| sort @timestamp asc
| limit 1000
| display @timestamp, trace_id, message, @message
| dedup message`;

export const SERVICE: service.ServiceDescriptor = {
  name: 'pn-delayer-sender-limit-job',
  varPrefix: 'delayerSenderLimitJob',
  logGroup: '/aws/ecs/pn-delayer-sender-limit-job',
  queryOverride: DELAYER_ERROR_QUERY,
};
