import type { service } from '../../../../toolkits/send/index.js';
import { DELAYER_ERROR_QUERY } from '../../shared/DELAYER_ERROR_QUERY.js';

export const SERVICE: service.ServiceDescriptor = {
  name: 'pn-delayer-sender-limit-job',
  varPrefix: 'delayerSenderLimitJob',
  logGroup: '/aws/ecs/pn-delayer-sender-limit-job',
  queryOverride: DELAYER_ERROR_QUERY,
};
