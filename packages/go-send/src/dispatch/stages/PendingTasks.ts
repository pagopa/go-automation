import { toError } from '@pagopa/go-common/errors';

/**
 * Set of row tasks running in background (verification, requestId), with a
 * drain that waits for tasks added while draining too.
 *
 * A task that rejects (e.g. the journal can no longer be written) is handled
 * at once, so it never becomes an unhandled rejection that kills the process
 * mid-run; the first error is rethrown by {@link drain}.
 */
export class PendingTasks {
  private readonly tasks = new Set<Promise<void>>();
  private failed = false;
  private firstError: unknown;

  /** Tasks still running. */
  public get size(): number {
    return this.tasks.size;
  }

  /**
   * Tracks a task until it settles.
   *
   * @param task - Running task; a rejection is kept for {@link drain}
   */
  public track(task: Promise<void>): void {
    const tracked = task
      .catch((error: unknown) => {
        if (this.failed) return;
        this.failed = true;
        this.firstError = error;
      })
      .finally(() => {
        this.tasks.delete(tracked);
      });
    this.tasks.add(tracked);
  }

  /**
   * Resolves when no task is left, including tasks added meanwhile.
   *
   * @throws The error of the first task that rejected
   */
  public async drain(): Promise<void> {
    while (this.tasks.size > 0) await Promise.all([...this.tasks]);
    if (this.failed) {
      throw toError(this.firstError);
    }
  }
}
