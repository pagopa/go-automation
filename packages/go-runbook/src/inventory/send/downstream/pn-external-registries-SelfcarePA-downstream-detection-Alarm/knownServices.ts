/**
 * Known services for the pn-external-registries-SelfcarePA-downstream-detection-Alarm runbook.
 */

import { type downstream, SEND_DOWNSTREAMS } from '../../../../toolkits/send/index.js';

/** Application service whose logs carry the SelfcarePA downstream markers. */
export const SERVICE = {
  name: 'pn-external-registries',
  varPrefix: 'externalRegistries',
  logGroup: '/aws/ecs/pn-external-registries',
};

/**
 * Downstream this runbook diagnoses (EVO-RBREORG-OPUS-01 R4, RBREORG-23).
 *
 * The September occurrence has 3,967 events and raw payloads beyond 64 MiB, so the scan
 * reads the marker **only** in the structured `message` (never the raw `@message`), keeps
 * the ERROR lines, selects the diagnostic message and trace header without the raw event,
 * and returns up to 10,000 rows.
 */
export const DOWNSTREAM: downstream.DownstreamSelector = {
  kind: 'named',
  name: SEND_DOWNSTREAMS.SELFCARE,
  emittedAs: 'SelfcarePA',
  errorLevelOnly: true,
  markerField: 'message',
  projection: ['@timestamp', 'level', 'trace_id', 'message'],
  resultLimit: 10_000,
};
