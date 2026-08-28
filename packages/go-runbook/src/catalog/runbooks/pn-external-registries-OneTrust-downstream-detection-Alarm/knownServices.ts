/**
 * Known services for the pn-external-registries-OneTrust-downstream-detection-Alarm runbook.
 */

import { service } from '../framework.js';

/** Application service whose logs contain the OneTrust downstream errors. */
export const SERVICE: service.ServiceDescriptor = {
  name: 'pn-external-registries',
  varPrefix: 'externalRegistries',
  logGroup: '/aws/ecs/pn-external-registries',
  // The log marker is `OneTrust`; the Watchtower downstream census uses `One-Trust`.
  queryOverride: service.buildDownstreamDetectionQuery({ downstreamName: 'OneTrust' }),
};
