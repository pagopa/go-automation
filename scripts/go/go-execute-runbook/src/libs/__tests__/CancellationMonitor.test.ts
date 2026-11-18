import assert from 'node:assert/strict';
import { describe, it, type TestContext } from 'node:test';

import type { WatchtowerClient } from '@go-automation/go-watchtower-client';

import { CancellationMonitor, type CancellationMonitorOptions } from '../CancellationMonitor.js';
import { ExecutionAbortCoordinator } from '../ExecutionAbortCoordinator.js';

const CANCEL_REQUEST_ID = '0192c000-0000-7000-8000-0000000000c1';

/** Fake of Watchtower's progress callback. */
type ProgressExecutionFn = (...args: never[]) => Promise<unknown>;

interface MonitorHarness {
  readonly monitor: CancellationMonitor;
  readonly coordinator: ExecutionAbortCoordinator;
}

/** Builds a monitor on `progressExecution`, stopped when the test ends. */
function createMonitor(
  t: TestContext,
  progressExecution: ProgressExecutionFn,
  workerDeadlineAt: string = new Date(Date.now() + 60_000).toISOString(),
  options: CancellationMonitorOptions = {},
): MonitorHarness {
  // Safe: the monitor only calls progressExecution.
  const client = { progressExecution } as unknown as Pick<WatchtowerClient, 'progressExecution'>;
  const coordinator = new ExecutionAbortCoordinator();
  const monitor = new CancellationMonitor(
    client,
    '0192c000-0000-7000-8000-000000000001',
    '0192c000-0000-7000-8000-0000000000e1',
    { sqsMessageId: 'message-1', approximateReceiveCount: 1, workerDeadlineAt },
    coordinator,
    { intervalMs: 60_000, ...options },
  );
  t.after(async () => {
    await monitor.stop();
  });
  return { monitor, coordinator };
}

describe('CancellationMonitor', () => {
  it('classifies a fenced progress response as a stale attempt', async (t) => {
    const { monitor, coordinator } = createMonitor(
      t,
      async () => await Promise.resolve({ cancelRequested: false, staleAttempt: true }),
    );

    await monitor.start('RUNBOOK');

    assert.strictEqual(coordinator.cause, 'STALE_ATTEMPT');
  });

  it('observes a cancellation and keeps concurrent progress single-flight', async (t) => {
    let calls = 0;
    let resolveProgress: (() => void) | undefined;
    const { monitor, coordinator } = createMonitor(t, async () => {
      calls += 1;
      await new Promise<void>((resolve) => {
        resolveProgress = resolve;
      });
      return { cancelRequested: true, cancelRequestId: CANCEL_REQUEST_ID };
    });

    const first = monitor.progress('RUNBOOK');
    const second = monitor.progress('RUNBOOK');
    resolveProgress?.();
    await Promise.all([first, second]);

    assert.strictEqual(calls, 1);
    assert.strictEqual(coordinator.cause, 'USER_CANCELLED');
    assert.strictEqual(monitor.cancelRequestId, CANCEL_REQUEST_ID);
  });

  it('uses the latest workerDeadlineAt returned by Watchtower for subsequent progress calls', async (t) => {
    const initialDeadline = new Date(Date.now() + 60_000).toISOString();
    const refreshedDeadline = new Date(Date.now() + 120_000).toISOString();
    const seenDeadlines: number[] = [];
    let observedCallback = '';
    const { monitor } = createMonitor(
      t,
      async (_id: string, _body: unknown, options: { readonly deadlineAtMs: number }) => {
        seenDeadlines.push(options.deadlineAtMs);
        await Promise.resolve();
        return seenDeadlines.length === 1
          ? { cancelRequested: false, workerDeadlineAt: refreshedDeadline }
          : { cancelRequested: false };
      },
      initialDeadline,
      {
        onWorkerDeadlineAt: (workerDeadlineAt) => {
          observedCallback = workerDeadlineAt;
        },
      },
    );

    await monitor.progress('RUNBOOK');
    await monitor.progress('RUNBOOK');

    assert.deepStrictEqual(seenDeadlines, [Date.parse(initialDeadline), Date.parse(refreshedDeadline)]);
    assert.strictEqual(observedCallback, refreshedDeadline);
  });
});
