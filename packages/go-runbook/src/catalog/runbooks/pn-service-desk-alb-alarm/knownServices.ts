/**
 * Known services for the pn-service-desk-alb-alarm runbook.
 */

import type { service } from '../framework.js';

/** Application service whose logs are the primary diagnostic source. */
export const SERVICE: service.ServiceDescriptor = {
  name: 'pn-service-desk',
  varPrefix: 'serviceDesk',
  logGroup: '/aws/ecs/pn-service-desk',
};
