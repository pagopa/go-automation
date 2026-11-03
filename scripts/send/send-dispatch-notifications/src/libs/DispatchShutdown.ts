import type { Dispatch } from '@go-automation/go-send';

import type { ShutdownDoneFn } from '../types/ShutdownDoneFn.js';

/**
 * Graceful stop of a run on SIGINT/SIGTERM (§11.3).
 *
 * GOScript calls its `onCleanup` hook on the first signal and exits when the
 * hook resolves: the hook stops the session (no new call starts) and waits
 * until `main` has drained the calls in flight and materialized the output.
 * Created per run in `index.ts` and passed to `main` explicitly.
 */
export class DispatchShutdown {
  private session: Dispatch.DispatchSession | undefined;
  private finished: Promise<void> = Promise.resolve();
  private markFinished: ShutdownDoneFn | undefined;
  private interrupted = false;

  /** Whether the run was stopped by a signal. */
  public get wasInterrupted(): boolean {
    return this.interrupted;
  }

  /**
   * Registers the running session; `done()` must be called when the output
   * has been materialized.
   *
   * @param session - The session being executed
   */
  public attach(session: Dispatch.DispatchSession): void {
    this.session = session;
    this.finished = new Promise<void>((resolve) => {
      this.markFinished = resolve;
    });
  }

  /** Marks the run as finished (output materialized). */
  public done(): void {
    this.session = undefined;
    this.markFinished?.();
  }

  /** `onCleanup` hook: stops the session and waits for the materialization. */
  public async stopAndWait(): Promise<void> {
    if (this.session === undefined) return;
    this.interrupted = true;
    this.session.stop();
    await this.finished;
  }
}
