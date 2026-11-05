import { GOBackoff, GOConcurrencyPool, toError } from '@go-automation/go-common/core';
import type { GOBackoffFn } from '@go-automation/go-common/core';

import type { SENDTimelineElement } from '../../services/timeline/models/SENDTimelineElement.js';
import { IUN_UNKNOWN, WORKFLOW_ENDED_PREFIX } from '../model/requestIdReasons.js';
import { sleepUnlessStopped } from '../stages/abortableWaits.js';
import type { CredentialErrorPredicate } from './CredentialErrorPredicate.js';
import type { RequestIdStageOptions } from './RequestIdStageOptions.js';
import { selectRequestIds } from './selectRequestIds.js';
import { PendingTasks } from '../stages/PendingTasks.js';

const DEFAULT_INITIAL_DELAY_MS = 60_000;
const DEFAULT_MAX_DELAY_MS = 120_000;
const DEFAULT_TIMEOUT_MS = 2 * 3_600_000;
const DEFAULT_CONCURRENCY = 10;

/**
 * Retrieves the `requestId` of accepted notifications from `pn-Timelines`
 * (§8.3).
 *
 * Each row is an independent scheduled check: one query per check, no slot
 * held while waiting, at most `concurrency` queries in parallel. A row ends:
 * - `REQUEST_ID_FOUND` when the `wait` rule is satisfied (or the workflow
 *   ended with some category found);
 * - `REQUEST_ID_NOT_FOUND` with `WORKFLOW_ENDED:<category>` or `TIMEOUT`.
 *
 * When the AWS credentials expire, the stage stops without closing any row:
 * the rows stay open and `--resume` continues them after `aws sso login`.
 */
export class RequestIdStage {
  private readonly pending = new PendingTasks();
  private readonly pool: GOConcurrencyPool;
  private readonly controller = new AbortController();
  private readonly signal: AbortSignal;
  private readonly backoff: GOBackoffFn;
  private readonly initialDelayMs: number;
  private readonly timeoutMs: number;
  private readonly isCredentialError: CredentialErrorPredicate;
  private expired = false;

  constructor(private readonly options: RequestIdStageOptions) {
    this.pool = new GOConcurrencyPool(options.concurrency ?? DEFAULT_CONCURRENCY);
    this.signal = AbortSignal.any([options.signal, this.controller.signal]);
    this.initialDelayMs = options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.backoff = GOBackoff.exponential(this.initialDelayMs, options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS);
    this.isCredentialError = options.isCredentialError;
  }

  /** Rows still waiting for their `requestId`. */
  public get pendingCount(): number {
    return this.pending.size;
  }

  /** Whether the stage stopped because the AWS credentials expired. */
  public get credentialsExpired(): boolean {
    return this.expired;
  }

  /**
   * Schedules the retrieval for an accepted (or sent) row.
   *
   * Without an IUN (the `notificationRequestId` could not be decoded) the
   * timeline cannot be read: the row is recorded `REQUEST_ID_NOT_FOUND`
   * `IUN_UNKNOWN` instead of being dropped silently; the verification can
   * still obtain the IUN on a resume.
   *
   * @param rowIndex - Row position
   * @param rowKey - Row key
   * @param iun - IUN of the notification, `undefined` when unknown
   */
  public schedule(rowIndex: number, rowKey: string, iun: string | undefined): void {
    if (this.signal.aborted) return;
    this.pending.track(
      iun === undefined ? this.recordUnknownIun(rowIndex, rowKey) : this.retrieve(rowIndex, rowKey, iun),
    );
  }

  /** Resolves when every scheduled row is concluded (or the stage stopped). */
  public async drain(): Promise<void> {
    await this.pending.drain();
  }

  private async recordUnknownIun(rowIndex: number, rowKey: string): Promise<void> {
    await this.options.ledger.record({
      event: 'REQUEST_ID_NOT_FOUND',
      rowIndex,
      rowKey,
      requestIdReason: IUN_UNKNOWN,
      error: {
        code: IUN_UNKNOWN,
        message:
          'the IUN could not be derived from the notificationRequestId: resume with the verify phase to obtain it',
      },
    });
  }

  private async retrieve(rowIndex: number, rowKey: string, iun: string): Promise<void> {
    const { clock, ledger, selection } = this.options;
    const deadline = clock.monotonic() + this.timeoutMs;
    let delayMs = this.initialDelayMs;
    // Error of the last query, if it failed: the cause of a TIMEOUT.
    let lastError: Error | undefined;
    for (let check = 1; ; check++) {
      const wait = Math.min(delayMs, Math.max(0, deadline - clock.monotonic()));
      if (!(await sleepUnlessStopped(clock, wait, this.signal))) return;

      const outcome = await this.query(iun);
      if (this.signal.aborted) return;
      const base = { rowIndex, rowKey, attempt: check };
      lastError = outcome instanceof Error ? outcome : undefined;
      const elements = outcome instanceof Error ? undefined : outcome;
      if (elements !== undefined) {
        const result = selectRequestIds(elements, selection);
        const endedWithSome = result.endedBy !== undefined && result.requestIds.size > 0;
        if (result.complete || endedWithSome) {
          await ledger.record({
            event: 'REQUEST_ID_FOUND',
            ...base,
            ...(result.requestId !== undefined && { requestId: result.requestId }),
            requestIds: Object.fromEntries(result.requestIds),
            requestIdReason: 'FOUND',
          });
          return;
        }
        if (result.endedBy !== undefined) {
          await ledger.record({
            event: 'REQUEST_ID_NOT_FOUND',
            ...base,
            requestIdReason: `${WORKFLOW_ENDED_PREFIX}${result.endedBy}`,
          });
          return;
        }
      }
      if (clock.monotonic() >= deadline) {
        await ledger.record({
          event: 'REQUEST_ID_NOT_FOUND',
          ...base,
          requestIdReason: 'TIMEOUT',
          // Without it a persistent query failure would look like a timeline that never had the category.
          ...(lastError !== undefined && {
            error: { code: 'TIMELINE_QUERY_FAILED', message: `last pn-Timelines query failed: ${lastError.message}` },
          }),
        });
        return;
      }
      delayMs = this.backoff({ attempt: check });
    }
  }

  /**
   * One timeline query: the elements; the error of a failed query (transient,
   * retried at the next check, and reported if the row times out); or
   * `undefined` when the stage stopped while the query waited for a pool slot
   * (stop, expired credentials): no query starts after a stop. Expired
   * credentials stop the stage before the pool slot is released, so the
   * queries queued behind it never run.
   */
  private async query(iun: string): Promise<ReadonlyArray<SENDTimelineElement> | Error | undefined> {
    return this.pool.run(async () => {
      if (this.signal.aborted) return undefined;
      try {
        return await this.options.source.query(iun);
      } catch (error: unknown) {
        if (this.isCredentialError(error)) {
          this.expired = true;
          this.controller.abort();
        }
        return toError(error);
      }
    });
  }
}
