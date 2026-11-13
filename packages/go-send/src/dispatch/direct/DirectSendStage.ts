import { getErrorMessage } from '@pagopa/go-common/errors';
import { GOHttpClientError } from '@pagopa/go-common/http';
import { GOBackoff, type GOBackoffFn } from '@pagopa/go-common/polling';

import { DispatchError } from '../DispatchError.js';
import { toDocumentFailure } from '../documents/toDocumentFailure.js';
import type { DispatchRecord } from '../model/DispatchRecord.js';
import type { DocumentRef } from '../model/DocumentRef.js';
import type { RowError } from '../model/RowError.js';
import type { RowState } from '../model/RowState.js';
import type { RowSender } from '../stages/RowSender.js';
import { acquireUnlessStopped, sleepUnlessStopped } from '../stages/abortableWaits.js';
import { buildPaperEngagement } from './buildPaperEngagement.js';
import type { DirectSendStageOptions } from './DirectSendStageOptions.js';

const DEFAULT_MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 30_000;
const MAX_ERROR_BODY = 500;

/**
 * Sends one row to pn-external-channels (§9.2).
 *
 * The `requestId` comes from the template, so the `PUT` is idempotent:
 * 429, 5xx and transport errors are retried with the same request, and a
 * resume simply sends again. Outcomes: `2xx` → `SENT`; `409` (requestId
 * already present) → `SENT` with warning `DUPLICATE_REQUEST_ID`; `400` and
 * other `4xx` → `SEND_FAILED`; `401`/`403` → run-level error. A `429` lowers
 * the shared limiter rate through the rate adapter.
 */
export class DirectSendStage implements RowSender {
  private readonly maxAttempts: number;
  private readonly backoff: GOBackoffFn = GOBackoff.exponential(RETRY_BASE_MS, RETRY_MAX_MS);

  constructor(private readonly options: DirectSendStageOptions) {
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  }

  /**
   * Sends a row; attempts are numbered after those of previous sessions.
   *
   * @param record - Valid `direct` record
   * @param previous - State from a previous session (resume), if any
   * @throws Errors that are not row-level (e.g. the journal can no longer be written)
   */
  public async send(record: DispatchRecord, previous?: RowState): Promise<void> {
    const { ledger, signal } = this.options;
    const requestId = record.direct?.requestId;
    if (signal.aborted || requestId === undefined) return;
    const row = { rowIndex: record.rowIndex, rowKey: record.rowKey };

    const documents = await this.resolveDocuments(record);
    if (documents === undefined) return;

    const previousAttempts = previous?.sendAttempts ?? 0;
    for (let sessionAttempt = 1; ; sessionAttempt++) {
      if (!(await acquireUnlessStopped(this.options.limiter, 0, signal))) return;
      const attempt = previousAttempts + sessionAttempt;
      await ledger.record({ event: 'SENDING', ...row, requestId, attempt });
      if (signal.aborted) return;
      const request = buildPaperEngagement(record, documents, new Date(this.options.clock.now()).toISOString());
      try {
        // Never aborted: a PUT in flight completes and its outcome is journaled.
        await this.options.api.sendPaper(request);
        this.options.rateAdapter.onSuccess();
        await this.sent(record, requestId, attempt);
        return;
      } catch (error: unknown) {
        const status = error instanceof GOHttpClientError ? error.statusCode : undefined;
        if (status === 409) {
          await this.sent(record, requestId, attempt);
          await ledger.record({ event: 'WARNING', ...row, warning: 'DUPLICATE_REQUEST_ID' });
          return;
        }
        if (status === 401 || status === 403) {
          await ledger.record({ event: 'SEND_FAILED', ...row, error: httpError(error, true) });
          this.options.onGlobalError(
            new DispatchError(`HTTP_${status}`, 'pn-external-channels rejected the client id'),
          );
          return;
        }
        if (status === 429) this.options.rateAdapter.onThrottled();
        const transient = status === undefined || status === 408 || status === 429 || status >= 500;
        if (!transient || sessionAttempt >= this.maxAttempts) {
          await ledger.record({ event: 'SEND_FAILED', ...row, error: httpError(error, transient) });
          return;
        }
        const retryAfter = error instanceof GOHttpClientError ? error.retryAfterMs : undefined;
        const delayMs = retryAfter ?? this.backoff({ attempt: sessionAttempt - 1 });
        if (!(await sleepUnlessStopped(this.options.clock, delayMs, signal))) return;
      }
    }
  }

  /** `ATTO` references of the row, or `undefined` when the row failed (recorded). */
  private async resolveDocuments(record: DispatchRecord): Promise<ReadonlyArray<DocumentRef> | undefined> {
    try {
      return await this.options.resolver.resolve(record.documents);
    } catch (error: unknown) {
      const failure = toDocumentFailure(error);
      if (failure === undefined) throw error;
      if (this.options.signal.aborted) return undefined; // stopped: the resume sends the row
      await this.options.ledger.record({
        event: 'SEND_FAILED',
        rowIndex: record.rowIndex,
        rowKey: record.rowKey,
        error: failure.rowError,
      });
      if (failure.runError !== undefined) this.options.onGlobalError(failure.runError);
      return undefined;
    }
  }

  private async sent(record: DispatchRecord, requestId: string, attempt: number): Promise<void> {
    const iun = record.preset?.iun;
    await this.options.ledger.record({
      event: 'SENT',
      rowIndex: record.rowIndex,
      rowKey: record.rowKey,
      requestId,
      attempt,
      ...(iun !== undefined && { iun }),
    });
  }
}

function httpError(error: unknown, retryable: boolean): RowError {
  const status = error instanceof GOHttpClientError ? error.statusCode : undefined;
  const body = error instanceof GOHttpClientError && error.response !== undefined ? JSON.stringify(error.response) : '';
  return {
    code: status === undefined ? 'TRANSPORT_ERROR' : `HTTP_${status}`,
    message: `${getErrorMessage(error)}${body === '' ? '' : ` ${body.slice(0, MAX_ERROR_BODY)}`}`,
    retryable,
  };
}
