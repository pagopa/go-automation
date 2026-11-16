import { getErrorMessage } from '@pagopa/go-common/errors';
import { GOHttpClientError } from '@pagopa/go-common/http';
import { GOBackoff, type GOBackoffFn } from '@pagopa/go-common/polling';

import type { SENDNotificationStatusResponse } from '../../services/notification/models/SENDNotificationStatusResponse.js';
import { DispatchError } from '../DispatchError.js';
import type { VerifyStageOptions } from './VerifyStageOptions.js';
import { acquireUnlessStopped, sleepUnlessStopped } from './abortableWaits.js';
import { PendingTasks } from './PendingTasks.js';

const DEFAULT_INITIAL_DELAY_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 15 * 60_000;
const DEFAULT_MAX_DELAY_MS = 60_000;
const BACKOFF_BASE_MS = 10_000;

/**
 * Verifies that sent notifications are accepted (§8.2).
 *
 * Each row is an independent scheduled check: nothing holds a concurrency
 * slot while waiting, and every check is a single status call through the
 * shared B2B limiter at low priority, so checks never slow down the sends.
 * `WAITING` honours `retryAfter`; `5xx`, `429` and transport errors only
 * reschedule. The per-row timeout runs from the first check that gets a
 * limiter permit, not from the send. A stop abandons the checks in flight.
 */
export class VerifyStage {
  private readonly pending = new PendingTasks();
  private readonly initialDelayMs: number;
  private readonly timeoutMs: number;
  private readonly backoff: GOBackoffFn;

  constructor(private readonly options: VerifyStageOptions) {
    this.initialDelayMs = options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.backoff = GOBackoff.exponential(BACKOFF_BASE_MS, options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS);
  }

  /** Rows still being verified. */
  public get pendingCount(): number {
    return this.pending.size;
  }

  /**
   * Schedules the verification of a sent row.
   *
   * @param rowIndex - Row position
   * @param rowKey - Row key
   * @param notificationRequestId - Id returned by the send
   */
  public schedule(rowIndex: number, rowKey: string, notificationRequestId: string): void {
    this.pending.track(this.verify(rowIndex, rowKey, notificationRequestId));
  }

  /** Resolves when every scheduled row is concluded (or the run stopped). */
  public async drain(): Promise<void> {
    await this.pending.drain();
  }

  private async verify(rowIndex: number, rowKey: string, notificationRequestId: string): Promise<void> {
    const { clock, ledger, signal } = this.options;
    // The timeout starts at the first check SEND actually receives: checks
    // run after every send in the shared limiter (priority 1), so the time a
    // check waits behind a long send queue must not consume it.
    let deadline: number | undefined;
    let delayMs = this.initialDelayMs;
    // Error of the last status check, if it failed: the cause of a VERIFY_TIMEOUT.
    let lastError: unknown;
    for (let check = 1; ; check++) {
      const wait = deadline === undefined ? delayMs : Math.min(delayMs, Math.max(0, deadline - clock.monotonic()));
      if (!(await sleepUnlessStopped(clock, wait, signal))) return;
      if (!(await acquireUnlessStopped(this.options.limiter, 1, signal))) return;
      deadline ??= clock.monotonic() + this.timeoutMs;

      let status: SENDNotificationStatusResponse | undefined;
      lastError = undefined;
      try {
        status = await this.options.api.status(notificationRequestId, this.options.apiVersion, signal);
      } catch (error: unknown) {
        lastError = error;
        if (signal.aborted) return; // check abandoned by the stop: the resume verifies the row
        if (error instanceof GOHttpClientError && (error.statusCode === 401 || error.statusCode === 403)) {
          this.options.onGlobalError(new DispatchError(`HTTP_${error.statusCode}`, 'status check rejected by SEND'));
          return;
        }
        // 404 right after the send, 5xx, 429, transport errors: check again later.
      }

      const base = { rowIndex, rowKey, attempt: check };
      if (status?.notificationRequestStatus === 'ACCEPTED' && status.iun !== undefined) {
        const current = ledger.get(rowIndex)?.iun;
        if (current !== undefined && current !== status.iun) {
          await ledger.record({ event: 'WARNING', rowIndex, rowKey, warning: 'IUN_MISMATCH' });
        }
        await ledger.record({ event: 'ACCEPTED', ...base, iun: status.iun });
        this.options.onAccepted?.(rowIndex, rowKey, status.iun);
        return;
      }
      if (status?.notificationRequestStatus === 'REFUSED') {
        const details = status.errors === undefined ? undefined : JSON.stringify(status.errors);
        await ledger.record({
          event: 'REFUSED',
          ...base,
          error: {
            code: 'REFUSED',
            message: 'notification refused by SEND',
            ...(details !== undefined && { details }),
          },
        });
        return;
      }
      if (clock.monotonic() >= deadline) {
        await ledger.record({
          event: 'VERIFY_TIMEOUT',
          ...base,
          error: {
            code: 'VERIFY_TIMEOUT',
            // Without the cause a persistent check failure would look like a notification SEND is still processing.
            message: `not accepted within ${Math.round(this.timeoutMs / 1000)} s${
              lastError === undefined ? '' : `; last status check failed: ${getErrorMessage(lastError)}`
            }`,
          },
        });
        return;
      }
      const retryAfterMs = (status?.retryAfter ?? 0) * 1000;
      delayMs = Math.max(this.backoff({ attempt: check - 1 }), retryAfterMs);
    }
  }
}
