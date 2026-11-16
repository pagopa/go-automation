/**
 * Options of {@link ./GOChildProcess.GOChildProcess}.
 */
export interface GOChildProcessOptions {
  /** Executable, looked up in `PATH` (e.g. `aws`). */
  readonly command: string;
  /** Arguments, passed as they are (no shell). */
  readonly args: ReadonlyArray<string>;
  /** Lines of output (stdout and stderr) kept for error messages (default 20). */
  readonly outputTailLines?: number;
  /**
   * Starts the process in its own process group, so the signals the terminal
   * sends to the foreground group (Ctrl+C) do not reach it: it keeps serving
   * while the script shuts down gracefully, and {@link GOChildProcess.stop}
   * ends it. The stop signals go to the whole group, so processes it started
   * (e.g. the `session-manager-plugin` of `aws ssm start-session`) end with
   * it. Default `false`.
   */
  readonly ownProcessGroup?: boolean;
}
