/**
 * Known services for the pn-national-registries-INAD-downstream-detection-Alarm runbook.
 */

import { service, SEND_DOWNSTREAMS } from '../framework.js';

/** Application service whose logs contain the INAD downstream errors. */
export const SERVICE: service.ServiceDescriptor = {
  name: 'pn-national-registries',
  varPrefix: 'nationalRegistries',
  logGroup: '/aws/ecs/pn-national-registries',
  queryOverride: service.buildDownstreamDetectionQuery({
    downstreamName: SEND_DOWNSTREAMS.INAD,
    excludedStatusCodes: [404],
  }),
};
