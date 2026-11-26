import type { RunbookExecutionResult } from '../../engine/types/RunbookExecutionResult.js';
import type { AnalysisDraftV1 } from '../../toolkits/common/analysis/draft/AnalysisDraft.js';
import type { LoggedQuery } from './LoggedQuery.js';

/** Outcome of a runbook executed by `executeWithLogs`. */
export interface RunbookLogsExecution {
  readonly result: RunbookExecutionResult;
  readonly draft: AnalysisDraftV1 | undefined;
  /** Ids of the detections, in time order (declaration order on ties). */
  readonly matchedIds: ReadonlyArray<string>;
  /** Every query sent, in order. */
  readonly queries: ReadonlyArray<LoggedQuery>;
}
