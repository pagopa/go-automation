import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { ExtractFallbackUuidFn } from './ExtractFallbackUuidFn.js';
import { matchTraceIdCandidate } from './matchTraceIdCandidate.js';
import { readServiceLogRow } from './readServiceLogRow.js';
import { RepresentativeErrorSelector } from './RepresentativeErrorSelector.js';
import type { ServiceLogSchema } from './ServiceLogSchema.js';
import type { TraceIdCandidateMatch } from './TraceIdCandidateMatch.js';

/** Result of {@link scanApplicationLogs}. */
export interface ApplicationLogsScan {
  readonly errorMessage: string;
  readonly fallbackUuid: string | undefined;
  readonly traceIdCandidate: TraceIdCandidateMatch | undefined;
}

/**
 * Scans the application logs of one service once: the latest error (policy
 * `latest`), the product correlation id when an extractor is injected, and the
 * first trace id found in the trace-id field or in the message (policy
 * `field-or-message`).
 *
 * @param results - CloudWatch Logs Insights result rows, in chronological order
 * @param schema - Schema of the application logs
 * @param extractFallbackUuid - Product correlation id extractor (SEND: FALLBACK-UUID)
 * @returns The scan
 */
export function scanApplicationLogs(
  results: ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>,
  schema: ServiceLogSchema,
  extractFallbackUuid?: ExtractFallbackUuidFn,
): ApplicationLogsScan {
  // Surfaced as "Ultimo errore" (`lastErrorMsg`): the latest error of the service.
  const errorMessage = new RepresentativeErrorSelector('latest');
  let fallbackUuid: string | undefined;
  let traceIdCandidate: TraceIdCandidateMatch | undefined;

  for (const raw of results) {
    const row = readServiceLogRow(raw, schema);
    errorMessage.offer(row);
    if (row.message !== '') fallbackUuid ??= extractFallbackUuid?.(row.message);
    // Keep the first valid identifier independently of the representative error.
    traceIdCandidate ??= matchTraceIdCandidate(row.fields, schema, 'field-or-message');
  }

  return { errorMessage: errorMessage.result(), fallbackUuid, traceIdCandidate };
}
