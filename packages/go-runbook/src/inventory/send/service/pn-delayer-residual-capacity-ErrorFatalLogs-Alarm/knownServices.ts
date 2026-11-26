import type { service } from '../../../../toolkits/send/index.js';
import { DELAYER_ERROR_QUERY } from '../../shared/DELAYER_ERROR_QUERY.js';

export const SERVICE: service.ServiceDescriptor = {
  name: 'pn-delayer-residual-capacity-job',
  varPrefix: 'delayerResidualCapacityJob',
  logGroup: '/aws/ecs/pn-delayer-residual-capacity-job',
  queryOverride: DELAYER_ERROR_QUERY,
};
