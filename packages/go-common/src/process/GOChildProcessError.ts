/**
 * A child process could not start, exited before being ready, or did not
 * become ready in time. Carries the last lines it printed, which usually
 * explain why (e.g. a missing plugin or expired credentials).
 */
export class GOChildProcessError extends Error {
  /**
   * @param message - What went wrong
   * @param outputTail - Last lines of stdout/stderr of the process
   * @param options - Standard error options (`cause`)
   */
  constructor(
    message: string,
    public readonly outputTail: ReadonlyArray<string>,
    options?: ErrorOptions,
  ) {
    super(outputTail.length === 0 ? message : `${message}\n${outputTail.join('\n')}`, options);
    this.name = 'GOChildProcessError';
  }
}
