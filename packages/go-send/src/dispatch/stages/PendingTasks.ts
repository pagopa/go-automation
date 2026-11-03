/**
 * Set of row tasks running in background (verification, requestId), with a
 * drain that waits for tasks added while draining too.
 */
export class PendingTasks {
  private readonly tasks = new Set<Promise<void>>();

  /** Tasks still running. */
  public get size(): number {
    return this.tasks.size;
  }

  /**
   * Tracks a task until it settles.
   *
   * @param task - Running task; it must not reject
   */
  public track(task: Promise<void>): void {
    const tracked = task.finally(() => {
      this.tasks.delete(tracked);
    });
    this.tasks.add(tracked);
  }

  /** Resolves when no task is left, including tasks added meanwhile. */
  public async drain(): Promise<void> {
    while (this.tasks.size > 0) await Promise.all([...this.tasks]);
  }
}
