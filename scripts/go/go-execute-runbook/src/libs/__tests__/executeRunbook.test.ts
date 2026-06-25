import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AWS, Core } from '@go-automation/go-common';
import type { ServiceRegistry } from '@go-automation/go-runbook';
import type { WatchtowerClient } from '@go-automation/go-watchtower-client';

import type { ExecuteRunbookDeps } from '../../types/ExecuteRunbookDeps.js';
import type { ExecuteRunbookInput } from '../../types/ExecuteRunbookInput.js';
import { executeRunbook } from '../executeRunbook.js';

const INPUT: ExecuteRunbookInput = {
  schemaVersion: '1.0.0',
  executionId: '0192c000-0000-7000-8000-000000000001',
  alarmEvent: {
    id: '0192c000-0000-7000-8000-0000000000aa',
    productId: '0192c000-0000-7000-8000-0000000000bb',
    environmentId: '0192c000-0000-7000-8000-0000000000cc',
    alarmId: '0192c000-0000-7000-8000-0000000000dd',
    alarmName: 'alarm-without-runbook',
    firedAt: '2026-06-22T10:00:00.000Z',
    awsAccountId: '170533023216',
    awsRegion: 'eu-south-1',
  },
  trigger: { kind: 'SLACK_INGESTOR' },
};

const DELIVERY = {
  sqsMessageId: 'message-1',
  approximateReceiveCount: 1,
  workerDeadlineAt: new Date(Date.now() + 60_000).toISOString(),
};

interface LifecycleOptions {
  readonly idempotencyKey: string;
  readonly deadlineAtMs: number;
}

describe('executeRunbook', () => {
  it('ACKs ALREADY_RUNNING without starting the engine or a terminal callback', async () => {
    let completeCalls = 0;
    const deps = fakeDeps({
      startExecution: async () => {
        await Promise.resolve();
        return { disposition: 'ALREADY_RUNNING', workerDeadlineAt: DELIVERY.workerDeadlineAt };
      },
      completeExecution: async () => {
        await Promise.resolve();
        completeCalls += 1;
        return { status: 'SUCCEEDED', outcome: 'NO_RUNBOOK' };
      },
    });

    const result = await executeRunbook(deps, INPUT, DELIVERY);

    assert.strictEqual(result.suppressedReason, 'ALREADY_RUNNING');
    assert.strictEqual(completeCalls, 0);
  });

  it('completes NO_RUNBOOK with the canonical key after acquiring an attempt', async () => {
    let completeKey = '';
    const deps = fakeDeps({
      startExecution: async () => {
        await Promise.resolve();
        return {
          disposition: 'START',
          attemptId: '0192c000-0000-7000-8000-0000000000e1',
          workerDeadlineAt: DELIVERY.workerDeadlineAt,
        };
      },
      progressExecution: async () => {
        await Promise.resolve();
        return { cancelRequested: false };
      },
      completeExecution: async (
        _id: string,
        body: { readonly outcome: string },
        options: { readonly idempotencyKey: string },
      ) => {
        await Promise.resolve();
        completeKey = options.idempotencyKey;
        assert.strictEqual(body.outcome, 'NO_RUNBOOK');
        return { status: 'SKIPPED', outcome: 'NO_RUNBOOK' };
      },
    });

    const result = await executeRunbook(deps, INPUT, DELIVERY);

    assert.strictEqual(result.status, 'SKIPPED');
    assert.strictEqual(
      completeKey,
      'complete:0192c000-0000-7000-8000-000000000001:0192c000-0000-7000-8000-0000000000e1',
    );
  });

  it('uses the authoritative start response deadline for worker lifecycle callbacks', async () => {
    const requestedDeadline = new Date(Date.now() + 120_000).toISOString();
    const authoritativeDeadline = new Date(Date.now() + 60_000).toISOString();
    const delivery = { ...DELIVERY, workerDeadlineAt: requestedDeadline };
    let progressDeadlineAtMs = 0;
    let completeDeadlineAtMs = 0;
    const deps = fakeDeps({
      startExecution: async () => {
        await Promise.resolve();
        return {
          disposition: 'START',
          attemptId: '0192c000-0000-7000-8000-0000000000e1',
          workerDeadlineAt: authoritativeDeadline,
        };
      },
      progressExecution: async (_id: string, _body: unknown, options: LifecycleOptions) => {
        await Promise.resolve();
        progressDeadlineAtMs = options.deadlineAtMs;
        return { cancelRequested: false };
      },
      completeExecution: async (_id: string, _body: unknown, options: LifecycleOptions) => {
        await Promise.resolve();
        completeDeadlineAtMs = options.deadlineAtMs;
        return { status: 'SKIPPED', outcome: 'NO_RUNBOOK' };
      },
    });

    const result = await executeRunbook(deps, INPUT, delivery);

    assert.strictEqual(result.status, 'SKIPPED');
    assert.strictEqual(progressDeadlineAtMs, Date.parse(authoritativeDeadline));
    assert.strictEqual(completeDeadlineAtMs, Date.parse(authoritativeDeadline));
    assert.notStrictEqual(completeDeadlineAtMs, Date.parse(requestedDeadline));
  });

  it('ACKs cancellation only after the owner callback succeeds', async () => {
    let cancelAckKey = '';
    let completeCalls = 0;
    const deps = fakeDeps({
      startExecution: async () => {
        await Promise.resolve();
        return {
          disposition: 'START',
          attemptId: '0192c000-0000-7000-8000-0000000000e1',
          workerDeadlineAt: DELIVERY.workerDeadlineAt,
        };
      },
      progressExecution: async () => {
        await Promise.resolve();
        return { cancelRequested: true, cancelRequestId: '0192c000-0000-7000-8000-0000000000c1' };
      },
      completeExecution: async () => {
        await Promise.resolve();
        completeCalls += 1;
        return { status: 'SUCCEEDED', outcome: 'NO_RUNBOOK' };
      },
      acknowledgeCancellation: async (_id: string, _body: unknown, options: { readonly idempotencyKey: string }) => {
        await Promise.resolve();
        cancelAckKey = options.idempotencyKey;
        return { status: 'CANCELLED' };
      },
    });

    const result = await executeRunbook(deps, INPUT, DELIVERY);

    assert.strictEqual(result.disposition, 'CANCEL_EXECUTION');
    assert.strictEqual(result.status, 'CANCELLED');
    assert.strictEqual(completeCalls, 0);
    assert.strictEqual(
      cancelAckKey,
      'cancel-ack:0192c000-0000-7000-8000-000000000001:0192c000-0000-7000-8000-0000000000c1:0192c000-0000-7000-8000-0000000000e1',
    );
  });

  it('ACKs an idempotency payload mismatch without retrying SQS', async () => {
    const deps = fakeDeps({
      startExecution: async () => {
        await Promise.resolve();
        return {
          disposition: 'START',
          attemptId: '0192c000-0000-7000-8000-0000000000e1',
          workerDeadlineAt: DELIVERY.workerDeadlineAt,
        };
      },
      progressExecution: async () => {
        await Promise.resolve();
        return { cancelRequested: false };
      },
      completeExecution: async () => {
        await Promise.resolve();
        return { conflict: 'IDEMPOTENCY_PAYLOAD_MISMATCH', status: 'SUCCEEDED' };
      },
    });

    const result = await executeRunbook(deps, INPUT, DELIVERY);

    assert.strictEqual(result.disposition, 'COMPLETE_OUTCOME');
    assert.strictEqual(result.status, 'SUCCEEDED');
  });

  it('ACKs a stale progress attempt without executing a terminal callback', async () => {
    let completeCalls = 0;
    const deps = fakeDeps({
      startExecution: async () => {
        await Promise.resolve();
        return {
          disposition: 'START',
          attemptId: '0192c000-0000-7000-8000-0000000000e1',
          workerDeadlineAt: DELIVERY.workerDeadlineAt,
        };
      },
      progressExecution: async () => {
        await Promise.resolve();
        return { cancelRequested: false, staleAttempt: true };
      },
      completeExecution: async () => {
        await Promise.resolve();
        completeCalls += 1;
        return { status: 'SUCCEEDED', outcome: 'NO_RUNBOOK' };
      },
    });

    const result = await executeRunbook(deps, INPUT, DELIVERY);

    assert.strictEqual(result.disposition, 'COMPLETE_OUTCOME');
    assert.strictEqual(result.suppressedReason, 'STALE_ATTEMPT');
    assert.strictEqual(result.status, 'RUNNING');
    assert.strictEqual(completeCalls, 0);
  });
});

function fakeDeps(watchtower: Readonly<Record<string, unknown>>): ExecuteRunbookDeps {
  return {
    watchtower: watchtower as unknown as WatchtowerClient,
    logger: {} as Core.GOLogger,
    services: {
      cloudWatchLogs: {} as AWS.AWSCloudWatchLogsService,
      athena: {} as AWS.AWSAthenaService,
    } as ServiceRegistry,
    awsProfiles: [],
    useConfiguredAwsProfiles: false,
  };
}
