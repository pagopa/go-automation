import { GOConcurrencyPool, toError } from '@go-automation/go-common/core';

import { decideRowAction } from './decideRowAction.js';
import type { DispatchRunOptions } from './DispatchRunOptions.js';
import type { InputRow } from '../input/InputRow.js';
import { AMBIGUOUS_STATUSES } from '../model/ambiguousStatuses.js';
import type { RowState } from '../model/RowState.js';
import type { RowToSend } from './RowToSend.js';

const DEFAULT_MAX_IN_FLIGHT = 40;

/**
 * Second pass over the input: sends the valid rows (§5.1).
 *
 * The input is streamed again; `GOConcurrencyPool.runEach` applies
 * backpressure, so at most `maxInFlight` rows are in the send stage and the
 * rate limiter spaces the calls. Sent rows go to the verification stage,
 * which runs concurrently and never holds a send slot. On resume, the state
 * of each row decides whether it is sent, reconciled, verified or skipped.
 */
export class DispatchRun {
  constructor(private readonly options: DispatchRunOptions) {}

  /**
   * Runs the send (and verify) phases until every row is concluded or the
   * run is stopped through the controller.
   *
   * When the send pass fails (e.g. the journal can no longer be written) the
   * run is stopped and the background stages are drained before the error is
   * rethrown, so nothing keeps writing after the caller closes the journal.
   *
   * @throws The first error among the send pass and the stage drains
   */
  public async execute(): Promise<void> {
    const { controller, ledger, failFast } = this.options;
    const pool = new GOConcurrencyPool(this.options.maxInFlight ?? DEFAULT_MAX_IN_FLIGHT);
    const sendStage = this.options.sendStage;
    let sendFailure: { readonly error: unknown } | undefined;
    try {
      await pool.runEach(this.rowsToSend(), async ({ record, previous }) => {
        if (sendStage === undefined) return;
        await sendStage.send(record, previous);
        if (failFast && ledger.get(record.rowIndex)?.status === 'SEND_FAILED') controller.abort();
      });
    } catch (error: unknown) {
      // Concurrent rows failing together come as one AggregateError: keep the first cause.
      sendFailure = { error: error instanceof AggregateError && error.errors.length > 0 ? error.errors[0] : error };
      controller.abort();
    }
    // In order: verification hands accepted rows to the requestId stage while
    // draining. Both are always awaited, whatever the outcome of the other.
    const verifyDrain = await settle(this.options.verifyStage?.drain());
    const requestIdDrain = await settle(this.options.requestIdStage?.drain());
    if (sendFailure !== undefined) throw toError(sendFailure.error);
    for (const drain of [verifyDrain, requestIdDrain]) {
      if (drain.status === 'rejected') throw toError(drain.reason);
    }
  }

  private async *rowsToSend(): AsyncGenerator<RowToSend, void, unknown> {
    const { ledger, verifyStage, requestIdStage, controller, policy } = this.options;
    for await (const row of this.options.reader.rows()) {
      if (controller.signal.aborted) return;
      const previous = await this.importPreset(row, ledger.get(row.rowIndex));
      const action = decideRowAction(previous, policy);
      if (action === 'verify' && previous?.notificationRequestId !== undefined) {
        verifyStage?.schedule(row.rowIndex, previous.rowKey, previous.notificationRequestId);
      } else if (action === 'request-id' && previous !== undefined) {
        requestIdStage?.schedule(row.rowIndex, previous.rowKey, previous.iun);
      } else if (action === 'send' && this.options.sendStage !== undefined) {
        const created = this.options.factory.create(row);
        if (created.result.ok) {
          yield { record: created.result.record, ...(previous !== undefined && { previous }) };
        } else if (previous !== undefined && AMBIGUOUS_STATUSES.has(previous.status)) {
          await this.markMappingChanged(previous);
        }
        // Otherwise the validation pass recorded the row as ROW_INVALID.
      }
    }
  }

  /**
   * A row SEND may have received whose mapping now fails cannot be
   * reconciled (a new POST needs the record): it stays visible as uncertain
   * instead of being skipped silently.
   */
  private async markMappingChanged(previous: RowState): Promise<void> {
    await this.options.ledger.record({
      event: 'SEND_UNCERTAIN',
      rowIndex: previous.rowIndex,
      rowKey: previous.rowKey,
      error: {
        code: 'MAPPING_CHANGED',
        message: `row left ${previous.status} by a previous session no longer maps to a valid record: check SEND by paProtocolNumber/idempotenceToken`,
      },
    });
  }

  /**
   * Phases without `send`: records the identifiers of the input as `PRESET`
   * for the rows never processed (no state, or revalidated to `PENDING`).
   */
  private async importPreset(row: InputRow, previous: RowState | undefined): Promise<RowState | undefined> {
    if (this.options.sendStage !== undefined) return previous;
    if (previous !== undefined && previous.status !== 'PENDING') return previous;
    const preset = this.options.factory.createPreset(row);
    if (!preset.ok) return previous;
    return this.options.ledger.record({
      event: 'PRESET',
      rowIndex: preset.preset.rowIndex,
      rowKey: preset.preset.rowKey,
      iun: preset.preset.iun,
      notificationRequestId: preset.preset.notificationRequestId,
    });
  }
}

/** Waits for an optional drain without throwing. */
async function settle(drain: Promise<void> | undefined): Promise<PromiseSettledResult<void>> {
  const [result] = await Promise.allSettled([drain]);
  return result ?? { status: 'fulfilled', value: undefined };
}
