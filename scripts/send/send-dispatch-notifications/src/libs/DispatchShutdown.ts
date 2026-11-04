import type { Dispatch } from '@go-automation/go-send';

/**
 * Graceful stop of a run on SIGINT/SIGTERM/SIGQUIT (§11.3).
 *
 * GOScript calls its `onCleanup` hook on the first signal and exits when the
 * hook resolves (code `128 + signal`). The hook stops the session (no new
 * call starts) and waits until `runDispatch` has drained the calls in flight,
 * materialized the output and closed the journal. Created per run in
 * `index.ts` and passed to `main` explicitly.
 *
 * `runDispatch` attaches the session right after opening it and calls
 * `done()` in its outermost `finally`, after closing it.
 */
export class DispatchShutdown {
  private session: Dispatch.DispatchSession | undefined;
  private finished: PromiseWithResolvers<void> | undefined;
  private interrupted = false;

  /** Whether the run was stopped by a signal. */
  public get wasInterrupted(): boolean {
    return this.interrupted;
  }

  /**
   * Registers the open session; `done()` must follow once it is closed.
   *
   * @param session - The session just opened
   */
  public attach(session: Dispatch.DispatchSession): void {
    this.session = session;
    this.finished = Promise.withResolvers<void>();
  }

  /** Marks the run as finished (output materialized, journal closed). Idempotent. */
  public done(): void {
    this.session = undefined;
    this.finished?.resolve();
  }

  /** `onCleanup` hook: stops the session and waits for `done()`. */
  public async stopAndWait(): Promise<void> {
    if (this.session === undefined || this.finished === undefined) return;
    this.interrupted = true;
    this.session.stop();
    await this.finished.promise;
  }
}
