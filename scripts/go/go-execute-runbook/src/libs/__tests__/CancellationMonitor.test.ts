import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { WatchtowerClient } from '@go-automation/go-watchtower-client';

import { CancellationMonitor } from '../CancellationMonitor.js';
import { ExecutionAbortCoordinator } from '../ExecutionAbortCoordinator.js';

describe('CancellationMonitor', () => {
  it('observes a cancellation and keeps concurrent progress single-flight', async () => {
    let calls = 0;
    let resolveProgress: (() => void) | undefined;
    const client = {
      progressExecution: async () => {
        calls += 1;
        await new Promise<void>((resolve) => {
          resolveProgress = resolve;
        });
        return { cancelRequested: true, cancelRequestId: '0192c000-0000-7000-8000-0000000000c1' };
      },
    } as unknown as Pick<WatchtowerClient, 'progressExecution'>;
    const coordinator = new ExecutionAbortCoordinator();
    const monitor = new CancellationMonitor(
      client,
      '0192c000-0000-7000-8000-000000000001',
      '0192c000-0000-7000-8000-0000000000e1',
      {
        sqsMessageId: 'message-1',
        approximateReceiveCount: 1,
        workerDeadlineAt: new Date(Date.now() + 60_000).toISOString(),
      },
      coordinator,
      { intervalMs: 60_000 },
    );

    const first = monitor.progress('RUNBOOK');
    const second = monitor.progress('RUNBOOK');
    resolveProgress?.();
    await Promise.all([first, second]);

    assert.strictEqual(calls, 1);
    assert.strictEqual(coordinator.cause, 'USER_CANCELLED');
    assert.strictEqual(monitor.cancelRequestId, '0192c000-0000-7000-8000-0000000000c1');
    await monitor.stop();
  });
});
