import { GOConcurrencyPool } from '@go-automation/go-common/core';

import { decideRowAction } from './decideRowAction.js';
import type { DispatchRunOptions } from './DispatchRunOptions.js';
import type { InputRow } from '../input/InputRow.js';
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
   */
  public async execute(): Promise<void> {
    const pool = new GOConcurrencyPool(this.options.maxInFlight ?? DEFAULT_MAX_IN_FLIGHT);
    const sendStage = this.options.sendStage;
    await pool.runEach(this.rowsToSend(), async ({ record, previous }) => {
      if (sendStage === undefined) return;
      await sendStage.send(record, previous);
      if (this.options.failFast && this.options.ledger.get(record.rowIndex)?.status === 'SEND_FAILED') {
        this.options.controller.abort();
      }
    });
    await this.options.verifyStage?.drain();
    await this.options.requestIdStage?.drain();
  }

  private async *rowsToSend(): AsyncGenerator<RowToSend, void, unknown> {
    const { ledger, verifyStage, requestIdStage, controller } = this.options;
    const policy = {
      retryFailed: this.options.retryFailed,
      retryUncertain: this.options.retryUncertain,
      verify: verifyStage !== undefined,
      requestId: requestIdStage !== undefined,
    };
    for await (const row of this.options.reader.rows()) {
      if (controller.signal.aborted) return;
      const previous = ledger.get(row.rowIndex) ?? (await this.importPreset(row));
      const action = decideRowAction(previous, policy);
      if (action === 'verify' && previous?.notificationRequestId !== undefined) {
        verifyStage?.schedule(row.rowIndex, previous.rowKey, previous.notificationRequestId);
      } else if (action === 'request-id' && previous?.iun !== undefined) {
        requestIdStage?.schedule(row.rowIndex, previous.rowKey, previous.iun);
      } else if (action === 'send' && this.options.sendStage !== undefined) {
        const created = this.options.factory.create(row);
        if (!created.result.ok) continue; // recorded as ROW_INVALID by the validation pass
        yield { record: created.result.record, ...(previous !== undefined && { previous }) };
      }
    }
  }

  /** Phases without `send`: records the identifiers of the input as `PRESET`. */
  private async importPreset(row: InputRow): Promise<RowState | undefined> {
    if (this.options.sendStage !== undefined) return undefined;
    const preset = this.options.factory.createPreset(row);
    if (!preset.ok) return undefined;
    return this.options.ledger.record({
      event: 'PRESET',
      rowIndex: preset.preset.rowIndex,
      rowKey: preset.preset.rowKey,
      iun: preset.preset.iun,
      notificationRequestId: preset.preset.notificationRequestId,
    });
  }
}
