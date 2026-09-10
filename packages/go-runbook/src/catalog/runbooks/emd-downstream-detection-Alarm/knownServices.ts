/**
 * Known services for the emd-downstream-detection-Alarm runbook.
 */

/** Application service whose logs contain EMD (Multicanalità) downstream errors. */

import type { downstream } from '../framework.js';

/** Application service whose logs carry the downstream markers. */
export const SERVICE = {
  name: 'pn-emd-integration',
  varPrefix: 'emdIntegration',
  logGroup: '/aws/ecs/pn-emd-integration',
};

/** Downstream this runbook diagnoses. */
export const DOWNSTREAM: downstream.DownstreamSelector = { kind: 'any' };
