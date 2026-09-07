/**
 * Known services for the pn-address-manager-POSTEL-downstream-detection-Alarm runbook.
 */

import { service } from '../framework.js';

/** Application service whose logs contain the POSTEL downstream errors. */
export const SERVICE: service.ServiceDescriptor = {
  name: 'pn-address-manager',
  varPrefix: 'addressManager',
  logGroup: '/aws/ecs/pn-address-manager',
  queryOverride: service.buildDownstreamDetectionQuery({
    downstreamName: 'POSTEL',
  }),
};
