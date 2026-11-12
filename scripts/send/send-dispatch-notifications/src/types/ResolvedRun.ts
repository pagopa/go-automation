import type { Dispatch } from '@go-automation/go-send';

/**
 * Identity of this session. Every session (first run or resume) writes into
 * its own GOPaths execution directory; a resume replays the journal
 * segments listed in the `run.json` of the session it resumes.
 */
export interface ResolvedRun {
  /** Stable across resumes: part of the idempotency keys. */
  readonly runId: string;
  /** GOPaths execution directory of this session. */
  readonly runDir: string;
  /** Name of `runDir`, the value to pass to `--resume`. */
  readonly runName: string;
  /** Absolute input file (from `run.json` on resume, unless given again). */
  readonly inputFile: string;
  readonly previousRun?: Dispatch.RunInfo;
  readonly previousRunInfoPath?: string;
}
