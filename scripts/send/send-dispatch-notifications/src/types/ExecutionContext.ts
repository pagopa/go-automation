import type { Dispatch } from '@go-automation/go-send';

import type { DispatchShutdown } from '../libs/DispatchShutdown.js';
import type { PlannedWork } from './PlannedWork.js';
import type { ResolvedRun } from './ResolvedRun.js';

/**
 * Everything the send phase of the script needs after the confirmation.
 */
export interface ExecutionContext {
  readonly session: Dispatch.DispatchSession;
  readonly run: ResolvedRun;
  readonly options: Dispatch.DispatchSessionOptions;
  readonly work: PlannedWork;
  readonly shutdown: DispatchShutdown;
  /** Rows of the input, for the rows never processed. */
  readonly totalRows: number;
  /** Duration of the validation pass, ms (for the summary). */
  readonly validationMs: number;
}
