/**
 * Known services for the workday-pn-external-channel-alb-alarm runbook.
 */

import type { service } from '../framework.js';

/**
 * Application service whose logs are the primary diagnostic source.
 */
export const SERVICE: service.ServiceDescriptor = {
  name: 'pn-external-channel',
  varPrefix: 'externalChannel',
  logGroup: '/aws/ecs/pn-external-channel',
};
