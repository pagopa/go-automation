import { GOLogger } from '@pagopa/go-common/logging';

import { RunbookEngine } from '../../engine/core/RunbookEngine.js';
import type { Runbook } from '../../engine/types/Runbook.js';
import { buildAnalysisDraft } from '../../toolkits/common/analysis/draft/buildAnalysisDraft.js';
import { createTestServiceRegistry } from '../../toolkits/common/testing/createTestServiceRegistry.js';
import { readEvidenceTime } from '../../toolkits/common/parsing/aws/cloudwatch-logs/readEvidenceTime.js';
import { fakeCloudWatchLogs } from './fakeCloudWatchLogs.js';
import type { LogsResponderFn } from './LogsResponderFn.js';
import type { RunbookLogsExecution } from './RunbookLogsExecution.js';

/**
 * Runs a runbook through the engine against a fake CloudWatch Logs service and
 * records every query it issues.
 *
 * @param runbook - Runbook under test
 * @param params - Runbook parameters (at least `startTime` and `endTime`)
 * @param respond - Rows returned for each query
 * @returns The execution result, its analysis draft, the matched case ids and the recorded queries
 *
 * @example
 * ```typescript
 * const { result } = await executeWithLogs(buildRunbook(), TIME_RANGE, () => [logRow({ '@message': 'ERROR' })]);
 * ```
 */
export async function executeWithLogs(
  runbook: Runbook,
  params: Readonly<Record<string, string>>,
  respond: LogsResponderFn,
): Promise<RunbookLogsExecution> {
  const cloudWatchLogs = fakeCloudWatchLogs(respond);
  const result = await new RunbookEngine(new GOLogger(), { evidenceTime: readEvidenceTime }).execute(
    runbook,
    new Map(Object.entries(params)),
    createTestServiceRegistry({ cloudWatchLogs }),
  );
  return {
    result,
    draft: buildAnalysisDraft(runbook, result),
    matchedIds: result.detections.map(({ knownError }) => knownError.code),
    queries: cloudWatchLogs.queries,
  };
}
