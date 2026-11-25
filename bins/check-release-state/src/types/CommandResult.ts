/** Outcome of an external command. */
export interface CommandResult {
  /** Exit code; `null` when the process was killed by a signal or could not start. */
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}
