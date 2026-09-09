/**
 * Known services and CloudWatch queries for the pn-mandate acceptance alarm.
 */

import type { service } from '../framework.js';

/**
 * Mirrors the four fields of the alarm metric filter.
 *
 * `trace_id` is intentionally projected: the source document's q2 requires it,
 * while its q1 projection omits it.
 */
export const MANDATE_ACCEPTANCE_FAILURE_TECH_QUERY = `filter level = 'ERROR' and aud_type = 'AUD_DL_ACCEPT' and mandate_workflow_type = 'CIE' and error_category = 'TECH'
| sort @timestamp asc
| limit 1000
| display @timestamp, level, message, @message, trace_id, aud_type, mandate_workflow_type, error_category`;

/** Retrieves every pn-mandate log carrying the trace selected by the first query. */
export const MANDATE_TRACE_QUERY = `filter @message like '{{TRACE_ID}}'
| sort @timestamp asc
| limit 1000
| display @timestamp, level, message, @message, trace_id`;

/** Application service whose logs contain CIE mandate-acceptance failures. */
export const SERVICE: service.ServiceDescriptor = {
  name: 'pn-mandate',
  varPrefix: 'mandate',
  logGroup: '/aws/ecs/pn-mandate',
  queryOverride: MANDATE_ACCEPTANCE_FAILURE_TECH_QUERY,
  traceQueryOverride: MANDATE_TRACE_QUERY,
};
