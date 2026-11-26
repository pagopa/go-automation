import { logLineToRecord } from '../parsing/aws/cloudwatch-logs/resultRows.js';
import type { LogSample } from './LogSample.js';
import type { RunbookEvidence } from './RunbookEvidence.js';

/**
 * The `log-sample` evidence of some recent log lines, truncated when the step read more rows than the sample keeps;
 * none when there is no line.
 *
 * @param sample - Lines, source step and number of rows read
 * @param maxRecentLogs - Lines a sample keeps
 * @returns The evidence, or nothing
 *
 * @example
 * ```typescript
 * const evidence = logSampleEvidence(
 *   { id: 'lambda-recent-errors', label: 'Ultimi errori Lambda', sourceStep: 'query-lambda-errors', logs, totalRows },
 *   5,
 * );
 * ```
 */
export function logSampleEvidence(sample: LogSample, maxRecentLogs: number): ReadonlyArray<RunbookEvidence> {
  if (sample.logs.length === 0) return [];
  return [
    {
      id: sample.id,
      label: sample.label,
      type: 'log-sample',
      sourceStep: sample.sourceStep,
      items: sample.logs.map(logLineToRecord),
      truncated: sample.totalRows > maxRecentLogs,
    },
  ];
}
