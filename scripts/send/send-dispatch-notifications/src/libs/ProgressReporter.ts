/**
 * Progress line updated in place during the run (§15).
 */

import type { GOPrompt } from '@go-automation/go-script';
import type { Dispatch } from '@go-automation/go-send';

import type { PlannedWork } from '../types/PlannedWork.js';
import { countOutcomes } from './outcomeCounts.js';

const REFRESH_MS = 1_000;

/**
 * Shows one progress line (no spinner per notification) refreshed every
 * second: sent/to send and current rate (when the session sends),
 * verification outcomes, requestIds, errors.
 *
 * The rows a previous session already sent (resume) are not counted in
 * "invio": the denominator is the number of rows this session sends.
 */
export class ProgressReporter {
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly alreadySent: number;

  /**
   * @param prompt - Prompt of the script (spinner)
   * @param session - Session being executed
   * @param work - What the session does (rows and whether it sends)
   */
  constructor(
    private readonly prompt: GOPrompt,
    private readonly session: Dispatch.DispatchSession,
    private readonly work: PlannedWork,
  ) {
    this.alreadySent = countOutcomes(session.progress()).sent;
  }

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
    const outcomes = countOutcomes(progress);
    const count = (status: Dispatch.RowStatus): number => progress.byStatus.get(status) ?? 0;
    const head = this.work.sending
      ? `invio ${outcomes.sent - this.alreadySent}/${this.work.rows} · ${progress.ratePerSecond.toFixed(1)}/s · `
      : `righe da elaborare ${this.work.rows} · `;
    const verify = `verifica ${outcomes.accepted} ok / ${outcomes.refused} refused / ${progress.verifyPending} in attesa`;
    const requestId = `requestId ${count('REQUEST_ID_FOUND')} trovati / ${progress.requestIdPending} in attesa`;
    const throttled = progress.throttled > 0 ? ` · 429: ${progress.throttled}` : '';
    return `${head}${verify} · ${requestId} · errori ${outcomes.errors}${throttled}`;
  }
}
