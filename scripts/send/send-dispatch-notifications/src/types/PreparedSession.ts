import type { Dispatch } from '@go-automation/go-send';

import type { ResolvedRun } from './ResolvedRun.js';

/**
 * Session options built from the configuration, with the identity of the run.
 */
export interface PreparedSession {
  readonly run: ResolvedRun;
  readonly options: Dispatch.DispatchSessionOptions;
}
