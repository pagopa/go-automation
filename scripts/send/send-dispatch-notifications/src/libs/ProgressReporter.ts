/**
 * Progress line updated in place during the run (§15).
 */

import type { Core } from '@go-automation/go-common';
import type { Dispatch } from '@go-automation/go-send';

const REFRESH_MS = 1_000;

/**
 * Shows one progress line (no spinner per notification) refreshed every
 * second: sent/total, current rate, verification outcomes, errors.
 */
export class ProgressReporter {
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly prompt: Core.GOPrompt,
    private readonly session: Dispatch.DispatchSession,
    private readonly validRows: number,
  ) {}

  /** Starts the refresh. */
  public start(): void {
    this.prompt.startSpinner(this.line());
    this.timer = setInterval(() => {
      this.prompt.updateSpinner(this.line());
    }, REFRESH_MS);
  }

  /** Stops the refresh and clears the line. */
  public stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    this.prompt.stopSpinner();
  }

  private line(): string {
    const progress = this.session.progress();
    const count = (status: Dispatch.RowStatus): number => progress.byStatus.get(status) ?? 0;
    const sent = count('SENT') + count('ACCEPTED') + count('REFUSED') + count('VERIFY_TIMEOUT');
    const errors = count('SEND_FAILED') + count('SEND_UNCERTAIN');
    return (
      `invio ${sent}/${this.validRows} · ${progress.ratePerSecond.toFixed(1)}/s · ` +
      `verifica ${count('ACCEPTED')} ok / ${count('REFUSED')} refused / ${progress.verifyPending} in attesa · ` +
      `errori ${errors}${progress.throttled > 0 ? ` · 429: ${progress.throttled}` : ''}`
    );
  }
}
