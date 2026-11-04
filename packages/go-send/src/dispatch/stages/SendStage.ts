import { getErrorMessage, GOHttpClientError } from '@go-automation/go-common/core';

import { buildNotificationRequest } from '../channels/buildNotificationRequest.js';
import { classifySendFailure } from '../channels/classifySendFailure.js';
import type { SendFailure } from '../channels/SendFailure.js';
import { DispatchError } from '../DispatchError.js';
import { toDocumentFailure } from '../documents/toDocumentFailure.js';
import { decodeIun, deriveRowIdentifiers } from '../ids/identifiers.js';
import type { DispatchRecord } from '../model/DispatchRecord.js';
import type { RowError } from '../model/RowError.js';
import type { RowState } from '../model/RowState.js';
import type { RowStatus } from '../model/RowStatus.js';
import type { SendContext } from './SendContext.js';
import type { RowSender } from './RowSender.js';
import type { SendStageOptions } from './SendStageOptions.js';
import { acquireUnlessStopped, sleepUnlessStopped } from './abortableWaits.js';

const DEFAULT_RECONCILE_DELAY_MS = 5_000;
const DEFAULT_MAX_RECONCILE_POSTS = 3;
const DEFAULT_MAX_LOOKUP_FAILURES = 3;
const DEFAULT_THROTTLE_WAIT_MS = 1_000;

/** States from which a row resumes with the reconciliation instead of a POST. */
const RECONCILE_ON_RESUME: ReadonlySet<RowStatus> = new Set<RowStatus>(['SENDING', 'RECONCILING', 'SEND_UNCERTAIN']);

/**
 * Sends one row through `POST requests` (§8.1.2–8.1.4).
 *
 * Every transition goes through the ledger (journal first-class): `SENDING`
 * before the POST, then `SENT`, `SEND_FAILED`, `RECONCILING` or
 * `SEND_UNCERTAIN`. Ambiguous outcomes are reconciled with the protocol
 * lookup; a new POST with the same keys is made only when the lookup returns
 * `404`, and SEND rejects a duplicate atomically (`409`), so a row never
 * produces two notifications.
 *
 * A stop never aborts a POST in flight (its outcome is journaled); waits,
 * limiter permits and protocol lookups are abandoned.
 */
export class SendStage implements RowSender {
  private readonly reconcileDelayMs: number;
  private readonly maxReconcilePosts: number;
  private readonly maxLookupFailures: number;

  constructor(private readonly options: SendStageOptions) {
    this.reconcileDelayMs = options.reconcileDelayMs ?? DEFAULT_RECONCILE_DELAY_MS;
    this.maxReconcilePosts = options.maxReconcilePosts ?? DEFAULT_MAX_RECONCILE_POSTS;
    this.maxLookupFailures = options.maxLookupFailures ?? DEFAULT_MAX_LOOKUP_FAILURES;
  }

  /**
   * Sends a row, or reconciles it when a previous session left it ambiguous.
   *
   * Never throws for row-level problems; a run-level error is reported via
   * `onGlobalError` after the row is recorded as `SEND_FAILED`.
   *
   * @param record - Valid record
   * @param previous - State from a previous session (resume), if any
   * @throws Errors that are not row-level (e.g. the journal can no longer be written)
   */
  public async send(record: DispatchRecord, previous?: RowState): Promise<void> {
    if (this.options.signal.aborted) return;
    const context: SendContext = {
      record,
      ids: deriveRowIdentifiers(this.options.runId, record.rowKey, record.options.paProtocolNumber),
      attempts: previous?.sendAttempts ?? 0,
      reconcilePosts: 0,
    };
    if (previous !== undefined && RECONCILE_ON_RESUME.has(previous.status)) {
      await this.reconcile(context, true);
      return;
    }
    if (await this.prepare(context)) await this.post(context);
  }

  private async prepare(context: SendContext): Promise<boolean> {
    if (context.request !== undefined) return true;
    try {
      context.documents = await this.options.resolver.resolve(context.record.documents);
      context.request = buildNotificationRequest(context.record, context.documents, context.ids);
      return true;
    } catch (error: unknown) {
      const failure = toDocumentFailure(error);
      if (failure === undefined) throw error;
      // Stopped while uploading: nothing reached SEND, the resume sends the row.
      if (this.options.signal.aborted) return false;
      await this.fail(context, failure.rowError);
      if (failure.runError !== undefined) this.options.onGlobalError(failure.runError);
      return false;
    }
  }

  private async post(context: SendContext): Promise<void> {
    const request = context.request;
    if (request === undefined) return;
    const { clock, signal } = this.options;
    const deadline = clock.monotonic() + this.options.sendTimeoutMs;
    /** Last `429`: SEND rejected the previous POST, so a stop leaves nothing ambiguous. */
    let throttled: SendFailure | undefined;
    for (;;) {
      if (!(await acquireUnlessStopped(this.options.limiter, 0, signal))) {
        await this.stoppedAfterThrottling(context, throttled);
        return;
      }
      context.attempts += 1;
      await this.options.ledger.record({
        event: 'SENDING',
        ...this.rowRef(context),
        ...context.ids,
        attempt: context.attempts,
        ...(request.group !== undefined && { groupId: request.group }),
        documents: {
          source: context.record.documents.kind,
          keys: (context.documents ?? []).map((document) => document.key),
          sha256: (context.documents ?? []).map((document) => document.sha256),
        },
      });

      // The run may have stopped while the entry was being written: the row
      // stays SENDING and the resume reconciles it (lookup, then POST if absent).
      if (signal.aborted) {
        await this.stoppedAfterThrottling(context, throttled);
        return;
      }

      let failure: SendFailure;
      try {
        // Never aborted: a POST in flight completes and its outcome is journaled.
        const response = await this.options.api.send(request, this.options.apiVersion);
        this.options.rateAdapter.onSuccess();
        await this.markSent(context, response.notificationRequestId, response.iun);
        return;
      } catch (error: unknown) {
        failure = classifySendFailure(error);
      }

      switch (failure.kind) {
        case 'throttled':
          this.options.rateAdapter.onThrottled();
          if (clock.monotonic() >= deadline) {
            await this.fail(context, { ...toRowError(failure), retryable: true });
            return;
          }
          throttled = failure;
          if (!(await sleepUnlessStopped(clock, failure.retryAfterMs ?? DEFAULT_THROTTLE_WAIT_MS, signal))) {
            await this.stoppedAfterThrottling(context, failure);
            return;
          }
          continue;
        case 'duplicate':
          // The notification certainly exists: look it up at once.
          await this.reconcile(context, false);
          return;
        case 'ambiguous':
          if (this.options.retryAmbiguous) await this.reconcile(context, true);
          else await this.uncertain(context, toRowError(failure));
          return;
        case 'row':
          await this.fail(context, { ...toRowError(failure), retryable: false });
          return;
        case 'global':
          await this.fail(context, { ...toRowError(failure), retryable: true });
          this.options.onGlobalError(
            new DispatchError(failure.code, `SEND rejected the request for every row: ${failure.message}`),
          );
          return;
        default: {
          const exhaustive: never = failure.kind;
          throw new Error(`Unhandled send failure ${String(exhaustive)}`);
        }
      }
    }
  }

  /**
   * The run stopped while the row was waiting to POST again after a `429`:
   * SEND rejected the last POST, so the row is a retryable failure instead
   * of staying `SENDING`.
   */
  private async stoppedAfterThrottling(context: SendContext, throttled: SendFailure | undefined): Promise<void> {
    if (throttled === undefined) return;
    await this.fail(context, { ...toRowError(throttled), retryable: true });
  }

  /**
   * Looks the notification up by protocol until it is found (`SENT`), absent
   * (`404`: new POST) or the lookups keep failing (`SEND_UNCERTAIN`).
   *
   * @param context - Row being sent
   * @param delayFirstLookup - Wait `reconcileDelayMs` before the first lookup
   *   (an ambiguous POST may still be completing); not needed after a `409`
   */
  private async reconcile(context: SendContext, delayFirstLookup: boolean): Promise<void> {
    const { clock, signal } = this.options;
    await this.options.ledger.record({ event: 'RECONCILING', ...this.rowRef(context), ...context.ids });
    let lookupFailures = 0;
    for (let lookup = 0; ; lookup++) {
      if ((delayFirstLookup || lookup > 0) && !(await sleepUnlessStopped(clock, this.reconcileDelayMs, signal))) {
        return;
      }
      if (!(await acquireUnlessStopped(this.options.limiter, 0, signal))) return;
      try {
        const found = await this.options.api.lookup(
          context.ids.paProtocolNumber,
          context.ids.idempotenceToken,
          this.options.apiVersion,
          signal,
        );
        await this.markSent(context, found.notificationRequestId, found.iun);
        return;
      } catch (error: unknown) {
        if (signal.aborted) return; // lookup abandoned by the stop: the row stays RECONCILING
        const status = error instanceof GOHttpClientError ? error.statusCode : undefined;
        if (status === 404) {
          await this.repost(context);
          return;
        }
        if (status === 401 || status === 403) {
          const failure = classifySendFailure(error);
          await this.uncertain(context, toRowError(failure));
          this.options.onGlobalError(new DispatchError(failure.code, `lookup rejected: ${failure.message}`));
          return;
        }
        lookupFailures += 1;
        if (lookupFailures > this.maxLookupFailures) {
          await this.uncertain(context, { code: 'LOOKUP_FAILED', message: getErrorMessage(error) });
          return;
        }
      }
    }
  }

  private async repost(context: SendContext): Promise<void> {
    if (context.reconcilePosts >= this.maxReconcilePosts) {
      await this.uncertain(context, {
        code: 'RECONCILE_EXHAUSTED',
        message: `notification not found after ${context.reconcilePosts} new attempts`,
      });
      return;
    }
    context.reconcilePosts += 1;
    if (await this.prepare(context)) await this.post(context);
  }

  private async markSent(context: SendContext, notificationRequestId: string, iun?: string): Promise<void> {
    const resolvedIun = iun ?? decodeIun(notificationRequestId);
    await this.options.ledger.record({
      event: 'SENT',
      ...this.rowRef(context),
      notificationRequestId,
      ...(resolvedIun !== undefined && { iun: resolvedIun }),
      attempt: context.attempts,
    });
    if (resolvedIun === undefined) {
      await this.options.ledger.record({ event: 'WARNING', ...this.rowRef(context), warning: 'IUN_DECODE_FAILED' });
    }
    this.options.onSent(context.record.rowIndex, context.record.rowKey, notificationRequestId);
  }

  private async fail(context: SendContext, error: RowError): Promise<void> {
    await this.options.ledger.record({ event: 'SEND_FAILED', ...this.rowRef(context), error });
  }

  private async uncertain(context: SendContext, error: RowError): Promise<void> {
    await this.options.ledger.record({ event: 'SEND_UNCERTAIN', ...this.rowRef(context), ...context.ids, error });
  }

  private rowRef(context: SendContext): { readonly rowIndex: number; readonly rowKey: string } {
    return { rowIndex: context.record.rowIndex, rowKey: context.record.rowKey };
  }
}

function toRowError(failure: SendFailure): RowError {
  return {
    code: failure.code,
    message: failure.status === undefined ? failure.message : `HTTP ${failure.status}: ${failure.message}`,
    ...(failure.details !== undefined && { details: failure.details }),
  };
}
