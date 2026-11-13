import { escapeLogsInsightsString } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { InteropK8sExactPodQueryOptions } from '../types/InteropK8sExactPodQueryOptions.js';
import type { InteropK8sQueryProfile } from './InteropK8sQueryProfile.js';
import { INTEROP_K8S_QUERY_PROFILE } from './INTEROP_K8S_QUERY_PROFILE.js';

/**
 * Query profile of an INTEROP k8s runbook that reads the errors of exactly the
 * alarmed pod, the criterion of the k8s error-count metric filters
 * (EVO-RBREORG-OPUS-01 P30). Replaces the copies of the same query in the
 * `queryProfile.ts` of the runbooks.
 *
 * @param id - Profile id
 * @param options - Variations of the query
 * @returns The profile, based on {@link INTEROP_K8S_QUERY_PROFILE}
 *
 * @example
 * ```typescript
 * export const AUDIT_SIGNER_QUERY_PROFILE = interop.k8s.interopK8sExactPodQueryProfile('interop-k8s-audit-signer', {
 *   applicationLogsQueryProfileId: 'interop-k8s-audit-signer-application-log',
 * });
 * ```
 */
export function interopK8sExactPodQueryProfile(
  id: string,
  options: InteropK8sExactPodQueryOptions,
): InteropK8sQueryProfile {
  return {
    ...INTEROP_K8S_QUERY_PROFILE,
    id,
    applicationLogsQueryProfileId: options.applicationLogsQueryProfileId,
    buildApplicationLogsQuery: (podApp) => exactPodQuery(podApp, options),
    ...(options.datedCidTracker === undefined
      ? {}
      : {
          cidTrackerQueryProfileId: options.datedCidTracker.queryProfileId,
          buildCidTrackerQuery: datedCidTrackerQuery,
        }),
  };
}

function exactPodQuery(podApp: string, options: InteropK8sExactPodQueryOptions): string {
  const pod = escapeLogsInsightsString(podApp);
  if (options.form === 'fields') {
    return [
      'fields @timestamp, pod_app, pod_namespace, @logStream, stream, log, @message',
      `| filter pod_app = "${pod}"`,
      '| filter @logStream not like /adot-collector/',
      '| filter log like /ERROR/ or stream = "stderr"',
      '| parse @message "[CID=*]" as cid',
      '| sort @timestamp asc',
    ].join('\n');
  }
  const podFilter =
    options.namespace === undefined
      ? `pod_app = "${pod}"`
      : `pod_namespace = "${escapeLogsInsightsString(options.namespace)}" and pod_app = "${pod}"`;
  const display =
    options.display === 'cid-with-stream'
      ? '@timestamp, pod_app, @logStream, stream, cid, log, @message'
      : '@timestamp, pod_app, cid, @message';
  return [
    'filter (log like /ERROR/ or stream = "stderr")',
    '| filter @logStream not like /adot-collector/',
    `| filter ${podFilter}`,
    '| parse @message "[CID=*]" as cid',
    `| display ${display}`,
    '| sort @timestamp asc',
  ].join('\n');
}

function datedCidTrackerQuery(cid: string): string {
  return [
    'parse @message "[CID=*]" as cid',
    `| filter cid = "${escapeLogsInsightsString(cid)}"`,
    '| parse log /(?<date>^[^\\s]+)/',
    '| sort date asc',
    '| display @timestamp, date, pod_app, cid, stream, log, @message',
  ].join('\n');
}
