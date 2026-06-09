/**
 * Known services for the workday-pn-external-channel-alb-alarm runbook.
 */

import type { service } from '@go-automation/go-runbook';

/**
 * Application service whose logs are the primary diagnostic source.
 */
export const SERVICE: service.ServiceDescriptor = {
  name: 'pn-external-channel',
  varPrefix: 'externalChannel',
  logGroup: '/aws/ecs/pn-external-channel',
};
