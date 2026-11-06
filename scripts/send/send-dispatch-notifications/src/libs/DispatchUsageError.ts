/**
 * Error caused by the command line or by the files it points to (invalid
 * parameter, resume with different settings, missing environment, malformed
 * environments file or mapping profile): the script logs only its message,
 * without a stack trace, and exits with 1.
 */
export class DispatchUsageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DispatchUsageError';
  }

  /**
   * Wraps an error raised while reading user-provided settings or files.
   *
   * @param error - Original error (kept as `cause`)
   * @returns A usage error with the same message
   */
  public static from(error: unknown): DispatchUsageError {
    if (error instanceof DispatchUsageError) return error;
    return new DispatchUsageError(error instanceof Error ? error.message : String(error), { cause: error });
  }
}
