/**
 * Known services for the pn-external-registries-OneTrust-downstream-detection-Alarm runbook.
 */

/** Application service whose logs contain the OneTrust downstream errors. */

import type { downstream } from '../framework.js';
import { SEND_DOWNSTREAMS } from '../framework.js';

/** Application service whose logs carry the downstream markers. */
export const SERVICE = {
  name: 'pn-external-registries',
  varPrefix: 'externalRegistries',
  logGroup: '/aws/ecs/pn-external-registries',
};

/** Downstream this runbook diagnoses. */
export const DOWNSTREAM: downstream.DownstreamSelector = {
  kind: 'named',
  name: SEND_DOWNSTREAMS.ONE_TRUST,
  emittedAs: 'OneTrust',
};
