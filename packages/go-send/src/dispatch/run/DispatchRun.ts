import { GOConcurrencyPool } from '@go-automation/go-common/core';

import { decideRowAction } from './decideRowAction.js';
import type { DispatchRunOptions } from './DispatchRunOptions.js';
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
   */
  public async execute(): Promise<void> {
    const pool = new GOConcurrencyPool(this.options.maxInFlight ?? DEFAULT_MAX_IN_FLIGHT);
    await pool.runEach(this.rowsToSend(), async ({ record, previous }) => {
      await this.options.sendStage.send(record, previous);
      if (this.options.failFast && this.options.ledger.get(record.rowIndex)?.status === 'SEND_FAILED') {
        this.options.controller.abort();
      }
    });
    await this.options.verifyStage?.drain();
  }

  private async *rowsToSend(): AsyncGenerator<RowToSend, void, unknown> {
    const { ledger, verifyStage, controller } = this.options;
    for await (const row of this.options.reader.rows()) {
      if (controller.signal.aborted) return;
      const previous = ledger.get(row.rowIndex);
      const action = decideRowAction(
        previous,
        this.options.retryFailed,
        this.options.retryUncertain,
        verifyStage !== undefined,
      );
      if (action === 'skip') continue;
      if (action === 'verify') {
        if (previous?.notificationRequestId !== undefined) {
          verifyStage?.schedule(row.rowIndex, previous.rowKey, previous.notificationRequestId);
        }
        continue;
      }
      const created = this.options.factory.create(row);
      if (!created.result.ok) continue; // recorded as ROW_INVALID by the validation pass
      yield { record: created.result.record, ...(previous !== undefined && { previous }) };
    }
  }
}
