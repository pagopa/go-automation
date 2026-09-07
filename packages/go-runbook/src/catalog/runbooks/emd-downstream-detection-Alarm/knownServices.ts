/**
 * Known services for the emd-downstream-detection-Alarm runbook.
 */

import { service } from '../framework.js';

/** Application service whose logs contain EMD (Multicanalità) downstream errors. */
export const SERVICE: service.ServiceDescriptor = {
  name: 'pn-emd-integration',
  varPrefix: 'emdIntegration',
  logGroup: '/aws/ecs/pn-emd-integration',
  // The production metric filter intentionally covers every operation emitted
  // after `[DOWNSTREAM] Service` (for example submitMessage and getRetrieval).
  queryOverride: service.buildDownstreamDetectionQuery({ matchAnyService: true }),
};
