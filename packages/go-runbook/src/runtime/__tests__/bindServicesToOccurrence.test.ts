import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AWSActiveOperationRegistry } from '@pagopa/go-aws';
import type { AWSExecutionTarget } from '@pagopa/go-aws';
import type { AWSCloudWatchLogsTarget } from '@pagopa/go-aws/cloudwatch-logs/insights';

import { createTestServiceRegistry } from '../../registry/createTestServiceRegistry.js';
import { bindServicesToOccurrence } from '../bindServicesToOccurrence.js';

/** What a fake CloudWatch Logs reader was asked to bind to. */
interface LogsBinding {
  readonly kind: 'base' | 'target' | 'execution';
  readonly target?: AWSCloudWatchLogsTarget;
  readonly activeOperations?: AWSActiveOperationRegistry;
}

/** Fake reader: each binding returns a new reader that remembers how it was bound. */
class FakeLogsReader {
  constructor(readonly binding: LogsBinding = { kind: 'base' }) {}

  forTarget(target: AWSCloudWatchLogsTarget, activeOperations?: AWSActiveOperationRegistry): FakeLogsReader {
    return new FakeLogsReader({ kind: 'target', target, ...(activeOperations && { activeOperations }) });
  }

  forExecution(activeOperations: AWSActiveOperationRegistry): FakeLogsReader {
    return new FakeLogsReader({ kind: 'execution', activeOperations });
  }
}

/** Fake Athena service: remembers the active-operation registry it was bound to. */
class FakeAthena {
  constructor(readonly activeOperations: AWSActiveOperationRegistry | undefined = undefined) {}

  forExecution(activeOperations: AWSActiveOperationRegistry): FakeAthena {
    return new FakeAthena(activeOperations);
  }
}

function baseRegistry(): ReturnType<typeof createTestServiceRegistry> {
  return createTestServiceRegistry({ cloudWatchLogs: new FakeLogsReader(), athena: new FakeAthena() });
}

function logsBinding(services: ReturnType<typeof createTestServiceRegistry>): LogsBinding {
  assert.ok(services.cloudWatchLogs instanceof FakeLogsReader);
  return services.cloudWatchLogs.binding;
}

function athenaOperations(
  services: ReturnType<typeof createTestServiceRegistry>,
): AWSActiveOperationRegistry | undefined {
  assert.ok(services.athena instanceof FakeAthena);
  return services.athena.activeOperations;
}

describe('bindServicesToOccurrence', () => {
  const occurrence: AWSExecutionTarget = { accountId: '111111111111', region: 'eu-south-1' };

  it('in oam-target mode scopes CloudWatch Logs to exactly the occurrence account and region', () => {
    const activeOperations = new AWSActiveOperationRegistry();
    const services = bindServicesToOccurrence(baseRegistry(), {
      target: occurrence,
      activeOperations,
      mode: 'oam-target',
    });

    const binding = logsBinding(services);
    assert.strictEqual(binding.kind, 'target');
    assert.deepStrictEqual(binding.target, { accountId: '111111111111', region: 'eu-south-1' });
    assert.strictEqual(binding.activeOperations, activeOperations);
    assert.strictEqual(athenaOperations(services), activeOperations);
  });

  it('binds two occurrences of different accounts to two distinct targets', () => {
    // The same log group name exists in both accounts: only the target tells them apart.
    const registry = baseRegistry();
    const first = bindServicesToOccurrence(registry, {
      target: { accountId: '111111111111', region: 'eu-south-1' },
      activeOperations: new AWSActiveOperationRegistry(),
      mode: 'oam-target',
    });
    const second = bindServicesToOccurrence(registry, {
      target: { accountId: '222222222222', region: 'eu-central-1' },
      activeOperations: new AWSActiveOperationRegistry(),
      mode: 'oam-target',
    });

    assert.deepStrictEqual(logsBinding(first).target, { accountId: '111111111111', region: 'eu-south-1' });
    assert.deepStrictEqual(logsBinding(second).target, { accountId: '222222222222', region: 'eu-central-1' });
    assert.notStrictEqual(logsBinding(first).activeOperations, logsBinding(second).activeOperations);
  });

  it('in configured-profiles mode keeps the profiles and binds only the execution', () => {
    const activeOperations = new AWSActiveOperationRegistry();
    const services = bindServicesToOccurrence(baseRegistry(), {
      target: occurrence,
      activeOperations,
      mode: 'configured-profiles',
    });

    const binding = logsBinding(services);
    assert.strictEqual(binding.kind, 'execution');
    assert.strictEqual(binding.target, undefined);
    assert.strictEqual(binding.activeOperations, activeOperations);
    assert.strictEqual(athenaOperations(services), activeOperations);
  });

  it('does not modify the input registry and keeps the other services', () => {
    const registry = baseRegistry();
    const services = bindServicesToOccurrence(registry, {
      target: occurrence,
      activeOperations: new AWSActiveOperationRegistry(),
      mode: 'oam-target',
    });

    assert.strictEqual(logsBinding(registry).kind, 'base');
    assert.strictEqual(athenaOperations(registry), undefined);
    assert.strictEqual(services.reporter, registry.reporter);
    assert.strictEqual(services.http, registry.http);
  });
});
