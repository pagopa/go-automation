import type { Dispatch } from '@go-automation/go-send';

import type { ResolvedRun } from './ResolvedRun.js';

/**
 * Session options built from the configuration, with the identity of the run.
 */
export interface PreparedSession {
  readonly run: ResolvedRun;
  readonly options: Dispatch.DispatchSessionOptions;
  /** Profile of `--aws-profiles` used for `pn-Timelines`, with the request-id phase. */
  readonly timelinesProfile?: string;
}
