import type { Dispatch } from '@go-automation/go-send';

import type { DispatchShutdown } from '../libs/DispatchShutdown.js';
import type { ResolvedRun } from './ResolvedRun.js';

/**
 * Everything the send phase of the script needs after the confirmation.
 */
export interface ExecutionContext {
  readonly session: Dispatch.DispatchSession;
  readonly run: ResolvedRun;
  readonly options: Dispatch.DispatchSessionOptions;
  readonly summary: Dispatch.ValidationSummary;
  readonly shutdown: DispatchShutdown;
  /** Duration of the validation pass, ms (for the summary). */
  readonly validationMs: number;
}
