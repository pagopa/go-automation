/**
 * Known services for the pn-external-registries IO downstream-detection runbook.
 */

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
  name: SEND_DOWNSTREAMS.APP_IO,
  // The application emits `IO`; the census calls the same downstream `AppIO`.
  emittedAs: 'IO',
  // Both predicates of the alarm's metric filter: ERROR level, and the marker
  // in the structured field rather than anywhere in the raw event.
  errorLevelOnly: true,
  matchStructuredMessage: true,
};
