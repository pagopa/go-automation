/**
 * Known services for the pn-address-manager-POSTEL-downstream-detection-Alarm runbook.
 */

/** Application service whose logs contain the POSTEL downstream errors. */

import type { downstream } from '../framework.js';
import { SEND_DOWNSTREAMS } from '../framework.js';

/** Application service whose logs carry the downstream markers. */
export const SERVICE = {
  name: 'pn-address-manager',
  varPrefix: 'addressManager',
  logGroup: '/aws/ecs/pn-address-manager',
};

/** Downstream this runbook diagnoses. */
export const DOWNSTREAM: downstream.DownstreamSelector = {
  kind: 'named',
  name: SEND_DOWNSTREAMS.CONSOLIDATORE_POSTALE,
  emittedAs: 'POSTEL',
};
