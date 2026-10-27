/**
 * Known services for the pn-external-registries-SelfcarePA-downstream-detection-Alarm runbook.
 */

import type { service } from '../framework.js';

/** Application service whose logs are the primary diagnostic source. */
export const SERVICE: service.ServiceDescriptor = {
  name: 'pn-external-registries',
  varPrefix: 'externalRegistries',
  logGroup: '/aws/ecs/pn-external-registries',
  // The September occurrence has 3,967 events and raw payloads exceed 64 MiB.
  // Keep the diagnostic message and trace header without duplicating the raw event.
  queryOverride: `filter level = 'ERROR'
    and message like '[DOWNSTREAM] Service SelfcarePA returned errors='
| fields @timestamp, level, trace_id, message
| sort @timestamp asc
| limit 10000`,
};
