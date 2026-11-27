import type { service } from '../../../../toolkits/send/index.js';

/** The FATAL lines of the documented query, distinct by message. */
const EXTERNAL_CHANNEL_FATAL_QUERY = `filter level like "FATAL" or (level like "ERROR" and @message like "* FATAL *") or @message like "ALLARM!"
| sort @timestamp asc
| display @timestamp, trace_id, message, @message
| dedup message
| limit 1000`;

export const SERVICE: service.ServiceDescriptor = {
  name: 'pn-external-channel',
  varPrefix: 'externalChannel',
  logGroup: '/aws/ecs/pn-external-channel',
  queryOverride: EXTERNAL_CHANNEL_FATAL_QUERY,
};
