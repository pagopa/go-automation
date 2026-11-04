import { GOBackoff, GOConcurrencyPool } from '@go-automation/go-common/core';
import type { GOBackoffFn } from '@go-automation/go-common/core';

import type { SENDTimelineElement } from '../../services/timeline/models/SENDTimelineElement.js';
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
   * @param rowIndex - Row position
   * @param rowKey - Row key
   * @param iun - IUN of the notification
   */
  public schedule(rowIndex: number, rowKey: string, iun: string): void {
    if (this.signal.aborted) return;
    this.pending.track(this.retrieve(rowIndex, rowKey, iun));
  }

  /** Resolves when every scheduled row is concluded (or the stage stopped). */
  public async drain(): Promise<void> {
    await this.pending.drain();
  }

  private async retrieve(rowIndex: number, rowKey: string, iun: string): Promise<void> {
    const { clock, ledger, selection } = this.options;
    const deadline = clock.monotonic() + this.timeoutMs;
    let delayMs = this.initialDelayMs;
    for (let check = 1; ; check++) {
      const wait = Math.min(delayMs, Math.max(0, deadline - clock.monotonic()));
      if (!(await sleepUnlessStopped(clock, wait, this.signal))) return;

      const elements = await this.query(iun);
      if (this.signal.aborted) return;
      const base = { rowIndex, rowKey, attempt: check };
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
            requestIdReason: `WORKFLOW_ENDED:${result.endedBy}`,
          });
          return;
        }
      }
      if (clock.monotonic() >= deadline) {
        await ledger.record({ event: 'REQUEST_ID_NOT_FOUND', ...base, requestIdReason: 'TIMEOUT' });
        return;
      }
      delayMs = this.backoff({ attempt: check });
    }
  }

  /**
   * One timeline query; `undefined` on a transient error (retried at the next
   * check) or when the stage stopped while the query waited for a pool slot
   * (stop, expired credentials): no query starts after a stop. Expired
   * credentials stop the stage before the pool slot is released, so the
   * queries queued behind it never run.
   */
  private async query(iun: string): Promise<ReadonlyArray<SENDTimelineElement> | undefined> {
    return this.pool.run(async () => {
      if (this.signal.aborted) return undefined;
      try {
        return await this.options.source.query(iun);
      } catch (error: unknown) {
        if (this.isCredentialError(error)) {
          this.expired = true;
          this.controller.abort();
        }
        return undefined;
      }
    });
  }
}
