import type { Dispatch } from '@go-automation/go-send';

import type { DispatchTarget } from './DispatchTarget.js';
import type { ResolvedRun } from './ResolvedRun.js';

/**
 * What the send plan shows (§14.2).
 */
export interface PlanContext {
  readonly target: DispatchTarget;
  readonly options: Dispatch.DispatchSessionOptions;
  readonly run: ResolvedRun;
  readonly preflight: Dispatch.PreflightReport | undefined;
  readonly shared: ReadonlyArray<Dispatch.DocumentRef> | undefined;
  readonly summary: Dispatch.ValidationSummary;
}
