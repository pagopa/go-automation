/**
 * Content of `run.json` (§11.1): the effective parameters of the session,
 * **without secrets**, the fingerprint of the input and the journal segments.
 *
 * Each session (first run, every resume) has its own GOPaths execution
 * directory and its own `run.json`; a resume lists the segments of all the
 * previous sessions plus its own.
 */
export interface RunInfo {
  /** Stable across resumes: it is part of the idempotency keys. */
  readonly runId: string;
  readonly createdAt: string;
  readonly inputPath: string;
  /** Hex SHA-256 of the input file: a resume with a different input stops. */
  readonly inputSha256: string;
  /** Journal segments (absolute paths), oldest first, this session last. */
  readonly journalFiles: ReadonlyArray<string>;
  /** `run.json` of the session this one resumes. */
  readonly resumedFrom?: string;
  /** Non-secret parameters (environment name, group, phases, rate…). */
  readonly parameters: Readonly<Record<string, unknown>>;
}
