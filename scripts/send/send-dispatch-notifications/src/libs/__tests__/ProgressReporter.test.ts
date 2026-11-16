import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { GOPrompt } from '@go-automation/go-script';
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

function snapshot(
  entries: ReadonlyArray<[Dispatch.RowStatus, number]>,
  acceptance: ReadonlyArray<[Dispatch.RowAcceptance, number]> = [],
): Dispatch.DispatchProgress {
  return {
    byStatus: new Map<Dispatch.RowStatus, number>(entries),
    byAcceptance: new Map<Dispatch.RowAcceptance, number>(acceptance),
    ratePerSecond: 19.6,
    throttled: 2,
    verifyPending: 2,
    requestIdPending: 3,
    queuedCalls: 0,
  };
}

/** Session double: the first snapshot is the state before execute(), then `during`. */
function session(before: Dispatch.DispatchProgress, during: Dispatch.DispatchProgress): Dispatch.DispatchSession {
  let calls = 0;
  return {
    progress: (): Dispatch.DispatchProgress => {
      calls += 1;
      return calls === 1 ? before : during;
    },
  } as unknown as Dispatch.DispatchSession;
}

const DURING = snapshot(
  [
    ['SENT', 2],
    ['ACCEPTED', 3],
    ['REFUSED', 1],
    ['REQUEST_ID_FOUND', 4],
    ['SEND_FAILED', 1],
  ],
  [
    ['ACCEPTED', 7],
    ['REFUSED', 1],
    ['UNKNOWN', 3],
  ],
);

describe('ProgressReporter', () => {
  it('shows sent/to send, rate, verification and requestId counters on one line', () => {
    const prompt = new FakePrompt();
    const reporter = new ProgressReporter(prompt as unknown as GOPrompt, session(snapshot([]), DURING), {
      rows: 20,
      sending: true,
    });

    reporter.start();
    reporter.stop();

    assert.equal(
      prompt.lines[0],
      'invio 10/20 · 19.6/s · verifica 7 ok / 1 refused / 2 in attesa · requestId 4 trovati / 3 in attesa · errori 1 · 429: 2',
    );
    assert.equal(prompt.stopped, true);
  });

  it('does not count the rows a previous session already sent (resume)', () => {
    const prompt = new FakePrompt();
    const before = snapshot([['ACCEPTED', 3]]);
    const reporter = new ProgressReporter(prompt as unknown as GOPrompt, session(before, DURING), {
      rows: 7,
      sending: true,
    });
    reporter.start();
    reporter.stop();
    assert.match(prompt.lines[0] ?? '', /^invio 7\/7 · /);
  });

  it('shows the rows to process when the session sends nothing', () => {
    const prompt = new FakePrompt();
    const reporter = new ProgressReporter(prompt as unknown as GOPrompt, session(snapshot([]), DURING), {
      rows: 12,
      sending: false,
    });
    reporter.start();
    reporter.stop();
    assert.match(prompt.lines[0] ?? '', /^righe da elaborare 12 · verifica 7 ok/);
  });
});
