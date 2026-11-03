import { GOHttpClientError } from '@go-automation/go-common/core';

import { DispatchError } from '../DispatchError.js';
import type { DispatchRecord } from '../model/DispatchRecord.js';
import type { DocumentRef } from '../model/DocumentRef.js';
import type { RowError } from '../model/RowError.js';
import type { RowSender } from '../stages/RowSender.js';
import { acquireUnlessStopped, sleepUnlessStopped } from '../stages/abortableWaits.js';
import { buildPaperEngagement } from './buildPaperEngagement.js';
import type { DirectSendStageOptions } from './DirectSendStageOptions.js';

const DEFAULT_MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 1_000;

/**
 * Sends one row to pn-external-channels (§9.2).
 *
 * The `requestId` comes from the template, so the `PUT` is idempotent:
 * 429, 5xx and transport errors are retried with the same request, and a
 * resume simply sends again. Outcomes: `2xx` → `SENT`; `409` (requestId
 * already present) → `SENT` with warning `DUPLICATE_REQUEST_ID`; `400` and
 * other `4xx` → `SEND_FAILED`; `401`/`403` → run-level error.
 */
export class DirectSendStage implements RowSender {
  private readonly maxAttempts: number;

  constructor(private readonly options: DirectSendStageOptions) {
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  }

  public async send(record: DispatchRecord): Promise<void> {
    const { ledger, signal } = this.options;
    const requestId = record.direct?.requestId;
    if (signal.aborted || requestId === undefined) return;
    const row = { rowIndex: record.rowIndex, rowKey: record.rowKey };

    let documents: ReadonlyArray<DocumentRef>;
    try {
      documents = await this.options.resolver.resolve(record.documents);
    } catch (error: unknown) {
      const code = error instanceof DispatchError ? error.code : 'DOCUMENT_ERROR';
      await ledger.record({
        event: 'SEND_FAILED',
        ...row,
        error: { code, message: messageOf(error), retryable: true },
      });
      return;
    }

    for (let attempt = 1; ; attempt++) {
      if (!(await acquireUnlessStopped(this.options.limiter, 0, signal))) return;
      await ledger.record({ event: 'SENDING', ...row, requestId, attempt });
      if (signal.aborted) return;
      const request = buildPaperEngagement(record, documents, new Date(this.options.clock.now()).toISOString());
      try {
        await this.options.api.sendPaper(request);
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
        const transient = status === undefined || status === 408 || status === 429 || status >= 500;
        if (!transient || attempt >= this.maxAttempts) {
          await ledger.record({ event: 'SEND_FAILED', ...row, error: httpError(error, transient) });
          return;
        }
        const retryAfter = error instanceof GOHttpClientError ? error.retryAfterMs : undefined;
        if (!(await sleepUnlessStopped(this.options.clock, retryAfter ?? RETRY_BASE_MS * 2 ** (attempt - 1), signal))) {
          return;
        }
      }
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
    message: `${messageOf(error)}${body === '' ? '' : ` ${body.slice(0, 500)}`}`,
    retryable,
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
