/**
 * Known services for the pn-national-registries-InfoCamere-downstream-detection-Alarm runbook.
 */

/** Application service whose logs contain the InfoCamere downstream errors. */

import type { downstream } from '../framework.js';
import { SEND_DOWNSTREAMS } from '../framework.js';

/** Application service whose logs carry the downstream markers. */
export const SERVICE = {
  name: 'pn-national-registries',
  varPrefix: 'nationalRegistries',
  logGroup: '/aws/ecs/pn-national-registries',
};

/** Downstream this runbook diagnoses. */
export const DOWNSTREAM: downstream.DownstreamSelector = { kind: 'named', name: SEND_DOWNSTREAMS.INFOCAMERE };
