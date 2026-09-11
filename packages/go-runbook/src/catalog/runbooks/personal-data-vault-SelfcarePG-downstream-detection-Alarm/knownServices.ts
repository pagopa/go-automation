/**
 * Known services for the personal-data-vault-SelfcarePG-downstream-detection-Alarm runbook.
 */

/** Application service whose SEP log group contains the SelfcarePG downstream errors. */

import type { downstream } from '../framework.js';
import { SEND_DOWNSTREAMS } from '../framework.js';

/** Application service whose logs carry the downstream markers. */
export const SERVICE = {
  name: 'pn-data-vault',
  varPrefix: 'dataVault',
  logGroup: '/aws/ecs/pn-data-vault-sep',
};

/** Downstream this runbook diagnoses. */
export const DOWNSTREAM: downstream.DownstreamSelector = {
  kind: 'named',
  name: SEND_DOWNSTREAMS.SELFCARE,
  emittedAs: 'SelfcarePG',
};
