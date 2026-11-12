/**
 * Files of a session, all resolved by the caller through GOPaths (the
 * session never builds paths).
 */
export interface DispatchRunFiles {
  /** `run.json` of this session. */
  readonly runInfoPath: string;
  /** Journal segment of this session. */
  readonly journalPath: string;
}
