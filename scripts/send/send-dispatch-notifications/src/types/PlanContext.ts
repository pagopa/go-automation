import type { Dispatch } from '@go-automation/go-send';

import type { DispatchTarget } from './DispatchTarget.js';
import type { PlannedWork } from './PlannedWork.js';
import type { ResolvedRun } from './ResolvedRun.js';

/**
 * What the send plan shows (§14.2).
 */
export interface PlanContext {
  readonly target: DispatchTarget;
  readonly options: Dispatch.DispatchSessionOptions;
  readonly run: ResolvedRun;
  /** Outcome of the B2B preflight; absent in a dry run or without B2B calls. */
  readonly preflight?: Dispatch.PreflightReport;
  /** Shared document references; absent when the run has none. */
  readonly shared?: ReadonlyArray<Dispatch.DocumentRef>;
  readonly summary: Dispatch.ValidationSummary;
  readonly work: PlannedWork;
  /** Profile of `--aws-profiles` used for `pn-Timelines`, with the request-id phase. */
  readonly timelinesProfile?: string;
}
