/**
 * Run-level error: stops the run (preflight failure, global HTTP error,
 * configuration error). Row-level problems never throw this.
 */
export class DispatchError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'DispatchError';
  }
}
