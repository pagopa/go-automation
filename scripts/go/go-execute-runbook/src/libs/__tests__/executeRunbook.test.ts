import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AWS, Core } from '@go-automation/go-common';
import type { RunbookOutput, ServiceRegistry } from '@go-automation/go-runbook';
import type { WatchtowerClient } from '@go-automation/go-watchtower-client';
import { RUNBOOK_CATALOG } from '@go-automation/go-runbook/catalog';

import type { ExecuteRunbookDeps } from '../../types/ExecuteRunbookDeps.js';
import type { ExecuteRunbookInput } from '../../types/ExecuteRunbookInput.js';
import { assertRunbookCapability } from '../assertRunbookCapability.js';
import { executeRunbook } from '../executeRunbook.js';
import { createTestServiceRegistry } from '@go-automation/go-runbook';

const RUNBOOK = RUNBOOK_CATALOG.resolveByKey('pn-tokenExchangeLambda-LogInvocationErrors-Alarm')!.descriptor;

const INPUT: ExecuteRunbookInput = {
  schemaVersion: '1.0.0',
  executionId: '0192c000-0000-7000-8000-000000000001',
  alarmEvent: {
    id: '0192c000-0000-7000-8000-0000000000aa',
    productId: '0192c000-0000-7000-8000-0000000000bb',
    environmentId: '0192c000-0000-7000-8000-0000000000cc',
    alarmId: '0192c000-0000-7000-8000-0000000000dd',
    alarmName: RUNBOOK.alarmNames[0],
    firedAt: '2026-06-22T10:00:00.000Z',
    awsAccountId: '170533023216',
    awsRegion: 'eu-south-1',
  },
  runbook: {
    key: RUNBOOK.key,
    version: RUNBOOK.version,
    definitionDigest: RUNBOOK.definitionDigest,
    catalogRevision: `sha256-${'b'.repeat(64)}`,
    workerRevision: 'build-abc123',
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

type StopObserverFn = () => void;

describe('executeRunbook', () => {
  it('allows local capability validation when the worker revision is unspecified', () => {
    assert.doesNotThrow(() => assertRunbookCapability(INPUT));
  });

  it('reports the pinned worker revision for local capability mismatches', () => {
    assert.throws(
      () =>
        assertRunbookCapability({
          ...INPUT,
          runbook: { ...INPUT.runbook, definitionDigest: `sha256-${'0'.repeat(64)}` },
        }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const details = (error as { readonly details?: { readonly workerRevision?: unknown } }).details;
        assert.strictEqual(details?.workerRevision, INPUT.runbook.workerRevision);
        assert.match(error.message, /requested=.* digest=.* requestedWorker=.*; worker=.*; registered=/u);
        assert.doesNotMatch(error.message, /alarmNames|catalogRevision/u);
        assert.ok(error.message.length < 2_048);
        return true;
      },
    );
  });

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
        return { status: 'SUCCEEDED', outcome: 'NO_DATA' };
      },
    });

    const result = await executeRunbook(deps, INPUT, DELIVERY);

    assert.strictEqual(result.suppressedReason, 'ALREADY_RUNNING');
    assert.strictEqual(completeCalls, 0);
  });

  it('rejects a capability mismatch before acquiring an attempt', async () => {
    let startCalls = 0;
    const deps = fakeDeps({
      startExecution: async () => {
        await Promise.resolve();
        startCalls += 1;
        return { disposition: 'ALREADY_RUNNING', workerDeadlineAt: DELIVERY.workerDeadlineAt };
      },
    });

    await assert.rejects(
      executeRunbook(
        deps,
        { ...INPUT, runbook: { ...INPUT.runbook, definitionDigest: `sha256-${'0'.repeat(64)}` } },
        DELIVERY,
      ),
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'workerFailureCode' in error &&
        error.workerFailureCode === 'RUNBOOK_CAPABILITY_MISMATCH',
    );
    assert.strictEqual(startCalls, 0);
  });

  it('rejects a worker revision mismatch before acquiring an attempt', async () => {
    let startCalls = 0;
    const deps = fakeDeps({
      startExecution: async () => {
        await Promise.resolve();
        startCalls += 1;
        return { disposition: 'ALREADY_RUNNING', workerDeadlineAt: DELIVERY.workerDeadlineAt };
      },
    });

    await assert.rejects(
      executeRunbook(
        deps,
        { ...INPUT, runbook: { ...INPUT.runbook, workerRevision: 'different-worker-revision' } },
        DELIVERY,
      ),
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'workerFailureCode' in error &&
        error.workerFailureCode === 'RUNBOOK_CAPABILITY_MISMATCH',
    );
    assert.strictEqual(startCalls, 0);
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
        return { status: 'SKIPPED', outcome: 'NO_DATA' };
      },
    });

    const result = await executeRunbook(deps, INPUT, delivery);

    assert.strictEqual(result.status, 'SKIPPED');
    assert.strictEqual(progressDeadlineAtMs, Date.parse(authoritativeDeadline));
    assert.strictEqual(completeDeadlineAtMs, Date.parse(authoritativeDeadline));
    assert.notStrictEqual(completeDeadlineAtMs, Date.parse(requestedDeadline));
  });

  it('uses the refreshed progress deadline for terminal lifecycle callbacks', async () => {
    const startDeadline = new Date(Date.now() + 60_000).toISOString();
    const refreshedDeadline = new Date(Date.now() + 120_000).toISOString();
    let completeDeadlineAtMs = 0;
    const deps = fakeDeps({
      startExecution: async () => {
        await Promise.resolve();
        return {
          disposition: 'START',
          attemptId: '0192c000-0000-7000-8000-0000000000e1',
          workerDeadlineAt: startDeadline,
        };
      },
      progressExecution: async () => {
        await Promise.resolve();
        return { cancelRequested: false, workerDeadlineAt: refreshedDeadline };
      },
      completeExecution: async (_id: string, _body: unknown, options: LifecycleOptions) => {
        await Promise.resolve();
        completeDeadlineAtMs = options.deadlineAtMs;
        return { status: 'SKIPPED', outcome: 'NO_DATA' };
      },
    });

    const result = await executeRunbook(deps, INPUT, DELIVERY);

    assert.strictEqual(result.status, 'SKIPPED');
    assert.strictEqual(completeDeadlineAtMs, Date.parse(refreshedDeadline));
    assert.notStrictEqual(completeDeadlineAtMs, Date.parse(startDeadline));
  });

  it('ACKs cancellation only after the owner callback succeeds', async () => {
    const requestedDeadline = new Date(Date.now() + 120_000).toISOString();
    const authoritativeDeadline = new Date(Date.now() + 60_000).toISOString();
    const delivery = { ...DELIVERY, workerDeadlineAt: requestedDeadline };
    let cancelAckKey = '';
    let cancelAckDeadlineAtMs = 0;
    let completeCalls = 0;
    const deps = fakeDeps({
      startExecution: async () => {
        await Promise.resolve();
        return {
          disposition: 'START',
          attemptId: '0192c000-0000-7000-8000-0000000000e1',
          workerDeadlineAt: authoritativeDeadline,
        };
      },
      progressExecution: async () => {
        await Promise.resolve();
        return { cancelRequested: true, cancelRequestId: '0192c000-0000-7000-8000-0000000000c1' };
      },
      completeExecution: async () => {
        await Promise.resolve();
        completeCalls += 1;
        return { status: 'SUCCEEDED', outcome: 'NO_DATA' };
      },
      acknowledgeCancellation: async (_id: string, _body: unknown, options: LifecycleOptions) => {
        await Promise.resolve();
        cancelAckKey = options.idempotencyKey;
        cancelAckDeadlineAtMs = options.deadlineAtMs;
        return { status: 'CANCELLED' };
      },
    });

    const result = await executeRunbook(deps, INPUT, delivery);

    assert.strictEqual(result.disposition, 'CANCEL_EXECUTION');
    assert.strictEqual(result.status, 'CANCELLED');
    assert.strictEqual(completeCalls, 0);
    assert.strictEqual(
      cancelAckKey,
      'cancel-ack:0192c000-0000-7000-8000-000000000001:0192c000-0000-7000-8000-0000000000c1:0192c000-0000-7000-8000-0000000000e1',
    );
    assert.strictEqual(cancelAckDeadlineAtMs, Date.parse(authoritativeDeadline));
    assert.notStrictEqual(cancelAckDeadlineAtMs, Date.parse(requestedDeadline));
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
        return { status: 'SUCCEEDED', outcome: 'NO_DATA' };
      },
    });

    const result = await executeRunbook(deps, INPUT, DELIVERY);

    assert.strictEqual(result.disposition, 'COMPLETE_OUTCOME');
    assert.strictEqual(result.suppressedReason, 'STALE_ATTEMPT');
    assert.strictEqual(result.status, 'RUNNING');
    assert.strictEqual(completeCalls, 0);
  });

  it('stops active AWS operations after a failed runbook outcome', async () => {
    let queryCalls = 0;
    let stopCalls = 0;
    let completeBody: { readonly errorMessage?: string } | undefined;
    const deps = fakeDeps(
      {
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
        completeExecution: async (_id: string, body: { readonly errorMessage?: string }) => {
          await Promise.resolve();
          completeBody = body;
          return { status: 'FAILED', outcome: 'FAILURE' };
        },
      },
      {
        cloudWatchLogs: failingCloudWatchLogsService(
          () => {
            queryCalls += 1;
          },
          () => (stopCalls += 1),
        ),
      },
    );

    const result = await executeRunbook(
      deps,
      { ...INPUT, alarmEvent: { ...INPUT.alarmEvent, alarmName: 'pn-tokenExchangeLambda-LogInvocationErrors-Alarm' } },
      DELIVERY,
    );

    assert.strictEqual(result.status, 'FAILED');
    assert.match(completeBody?.errorMessage ?? '', /query failed after remote operation registration/);
    assert.strictEqual(queryCalls, 1);
    assert.strictEqual(stopCalls, 1);
  });

  it('runs DailyExport error and invocation queries in the worker single-account OAM scope', async () => {
    const registered = RUNBOOK_CATALOG.resolveByKey('Lambda-DailyExport-DynamoDbTable-LogInvocationErrors-Alarm');
    assert.ok(registered);
    const descriptor = registered.descriptor;
    const requestId = 'fa3cf895-a2ae-46e6-9d44-d75bb2230d33';
    const queries: {
      readonly queryString?: string;
      readonly logGroupIdentifiers?: ReadonlyArray<string>;
      readonly logGroupNames?: ReadonlyArray<string>;
    }[] = [];
    const clientProvider = {
      getProfile: () => 'worker-role',
      getRegion: () => 'eu-south-1',
      cloudWatchLogs: {
        async send(command: {
          input: {
            queryString?: string;
            logGroupIdentifiers?: ReadonlyArray<string>;
            logGroupNames?: ReadonlyArray<string>;
          };
        }) {
          await Promise.resolve();
          if (command.input.queryString !== undefined) {
            queries.push(command.input);
            return { queryId: `query-${String(queries.length)}` };
          }
          return {
            status: 'Complete',
            results: [
              [
                { field: '@timestamp', value: '2026-06-22T10:00:00.000Z' },
                { field: '@requestId', value: requestId },
                { field: '@message', value: `REPORT RequestId: ${requestId}\tDuration: 3000.00 ms\tStatus: timeout` },
              ],
            ],
            statistics: { recordsMatched: 1, recordsScanned: 1, bytesScanned: 1 },
          };
        },
      },
    } as unknown as AWS.AWSClientProvider;
    const cloudWatchLogs = new AWS.AWSCloudWatchLogsService({
      profileNames: ['worker-role'],
      first: clientProvider,
      getClientProvider: (profile) => {
        assert.strictEqual(profile, 'worker-role');
        return clientProvider;
      },
    });
    let output: RunbookOutput | undefined;
    const deps = fakeDeps(
      {
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
        completeExecution: async (_id: string, body: { readonly analysisPayload: RunbookOutput }) => {
          await Promise.resolve();
          output = body.analysisPayload;
          return { status: 'SUCCEEDED', outcome: 'KNOWN_CASE' };
        },
      },
      { cloudWatchLogs },
    );
    const result = await executeRunbook(
      deps,
      {
        ...INPUT,
        alarmEvent: { ...INPUT.alarmEvent, alarmName: descriptor.alarmNames[0] },
        runbook: {
          ...INPUT.runbook,
          key: descriptor.key,
          version: descriptor.version,
          definitionDigest: descriptor.definitionDigest,
        },
      },
      DELIVERY,
    );

    assert.strictEqual(result.status, 'SUCCEEDED');
    assert.strictEqual(output?.execution.status, 'completed');
    assert.strictEqual(output?.outcome.kind, 'known-case-matched');
    assert.strictEqual(
      output?.analysis?.kind === 'KNOWN_CASE' ? output.analysis.proposedStatus : undefined,
      'IN_PROGRESS',
    );
    assert.strictEqual(queries.length, 2);
    assert.ok(queries[0]?.queryString?.includes("@message like 'ERROR'"));
    assert.ok(queries[1]?.queryString?.includes(requestId));
    for (const query of queries) {
      assert.deepStrictEqual(query.logGroupIdentifiers, [
        `arn:aws:logs:eu-south-1:${INPUT.alarmEvent.awsAccountId}:log-group:/aws/lambda/Lambda-DailyExport-DynamoDbTable`,
      ]);
      assert.strictEqual(query.logGroupNames, undefined);
    }
  });
});

function fakeDeps(
  watchtower: Readonly<Record<string, unknown>>,
  services: Partial<ServiceRegistry> = {},
): ExecuteRunbookDeps {
  return {
    watchtower: watchtower as unknown as WatchtowerClient,
    logger: new Core.GOLogger(),
    services: createTestServiceRegistry({
      cloudWatchLogs: successfulCloudWatchLogsService(),
      athena: { forExecution: () => ({}) } as unknown as AWS.AWSAthenaService,
      ...services,
    }),
    awsProfiles: [],
    useConfiguredAwsProfiles: false,
    workerArtifactRevision: INPUT.runbook.workerRevision,
  };
}

function successfulCloudWatchLogsService(): AWS.AWSCloudWatchLogsService {
  return {
    forTarget: () => ({
      queryWithStatistics: async () => {
        await Promise.resolve();
        return {
          rows: [],
          statistics: { bytesScanned: 0, recordsScanned: 0, recordsMatched: 0 },
          queryExecutions: [],
        };
      },
    }),
  } as unknown as AWS.AWSCloudWatchLogsService;
}

function failingCloudWatchLogsService(onQuery: StopObserverFn, onStop: StopObserverFn): AWS.AWSCloudWatchLogsService {
  return {
    forTarget: (_target: unknown, activeOperations: AWS.AWSActiveOperationRegistry) => ({
      queryWithStatistics: async () => {
        await Promise.resolve();
        onQuery();
        activeOperations.register({
          service: 'LOGS',
          operationId: 'query-1',
          stop: async () => {
            await Promise.resolve();
            onStop();
          },
        });
        throw new Error('query failed after remote operation registration');
      },
    }),
  } as unknown as AWS.AWSCloudWatchLogsService;
}
