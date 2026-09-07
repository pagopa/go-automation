/**
 * Known services for the personal-data-vault-SelfcarePG-downstream-detection-Alarm runbook.
 */

import { service } from '../framework.js';

/** Application service whose SEP log group contains the SelfcarePG downstream errors. */
export const SERVICE: service.ServiceDescriptor = {
  name: 'pn-data-vault',
  varPrefix: 'dataVault',
  logGroup: '/aws/ecs/pn-data-vault-sep',
  queryOverride: service.buildDownstreamDetectionQuery({
    downstreamName: 'SelfcarePG',
  }),
};
