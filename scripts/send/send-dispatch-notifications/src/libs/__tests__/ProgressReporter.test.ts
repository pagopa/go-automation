import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { Core } from '@go-automation/go-common';
import type { Dispatch } from '@go-automation/go-send';

import { ProgressReporter } from '../ProgressReporter.js';

/** Prompt double that records the spinner lines. */
class FakePrompt {
  public readonly lines: string[] = [];
  public stopped = false;

  public startSpinner(message: string): void {
    this.lines.push(message);
  }

  public updateSpinner(message: string): void {
    this.lines.push(message);
  }

  public stopSpinner(): void {
    this.stopped = true;
  }
}

describe('ProgressReporter', () => {
  it('shows sent, rate, verification and requestId counters on one line', () => {
    const progress: Dispatch.DispatchProgress = {
      byStatus: new Map<Dispatch.RowStatus, number>([
        ['SENT', 2],
        ['ACCEPTED', 3],
        ['REFUSED', 1],
        ['REQUEST_ID_FOUND', 4],
        ['SEND_FAILED', 1],
      ]),
      ratePerSecond: 19.6,
      throttled: 2,
      verifyPending: 2,
      requestIdPending: 3,
      queuedCalls: 0,
    };
    const session = { progress: (): Dispatch.DispatchProgress => progress } as unknown as Dispatch.DispatchSession;
    const prompt = new FakePrompt();
    const reporter = new ProgressReporter(prompt as unknown as Core.GOPrompt, session, 20);

    reporter.start();
    reporter.stop();

    assert.equal(
      prompt.lines[0],
      'invio 10/20 · 19.6/s · verifica 7 ok / 1 refused / 2 in attesa · requestId 4 trovati / 3 in attesa · errori 1 · 429: 2',
    );
    assert.equal(prompt.stopped, true);
  });
});
