/**
 * Thrown before the first step when a runbook requires services the execution
 * did not receive, or received in an unusable shape (EVO-RBREORG-OPUS-01 §7.1.3 A).
 */
export class RunbookMissingServicesError extends Error {
  override readonly name = 'RunbookMissingServicesError';

  /**
   * @param runbookId - Runbook being executed
   * @param missing - Required services that are absent or fail their capability check, sorted
   */
  constructor(
    readonly runbookId: string,
    readonly missing: ReadonlyArray<string>,
  ) {
    super(`Runbook "${runbookId}" requires services that were not provided: ${missing.join(', ')}`);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
