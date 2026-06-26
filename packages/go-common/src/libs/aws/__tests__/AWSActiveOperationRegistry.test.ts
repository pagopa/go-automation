import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AWSActiveOperationRegistry } from '../AWSActiveOperationRegistry.js';

describe('AWSActiveOperationRegistry', () => {
  it('stops a registered operation once and unregisters it', async () => {
    const registry = new AWSActiveOperationRegistry(100);
    let stops = 0;
    const operation = registry.register({
      service: 'LOGS',
      operationId: 'query-1',
      async stop() {
        stops += 1;
        await Promise.resolve();
      },
    });

    const [first, second] = await Promise.all([operation.stop(), operation.stop()]);
    const third = await operation.stop();

    assert.strictEqual(first, undefined);
    assert.strictEqual(second, undefined);
    assert.strictEqual(third, undefined);
    assert.strictEqual(stops, 1);
    assert.strictEqual(registry.size, 0);
  });

  it('releases an unregistered entry without letting an old stop delete its replacement', async () => {
    const registry = new AWSActiveOperationRegistry(100);
    let resolveFirstStop: (() => void) | undefined;
    let firstStops = 0;
    const first = registry.register({
      service: 'LOGS',
      operationId: 'query-1',
      async stop() {
        firstStops += 1;
        await new Promise<void>((resolve) => {
          resolveFirstStop = resolve;
        });
      },
    });
    const firstStop = first.stop();

    first.unregister();
    const replacement = registry.register({
      service: 'LOGS',
      operationId: 'query-1',
      async stop() {
        await Promise.resolve();
      },
    });
    resolveFirstStop?.();
    await firstStop;

    assert.strictEqual(registry.size, 1);
    await first.stop();
    assert.strictEqual(firstStops, 1);
    await replacement.stop();
    assert.strictEqual(registry.size, 0);
  });

  it('returns a bounded warning when cleanup fails', async () => {
    const registry = new AWSActiveOperationRegistry(100);
    registry.register({
      service: 'ATHENA',
      operationId: 'exec-1',
      async stop() {
        await Promise.resolve();
        throw new Error('stop failed');
      },
    });

    const warnings = await registry.stopAll();

    assert.deepStrictEqual(warnings, [
      {
        service: 'ATHENA',
        operationId: 'exec-1',
        code: 'REMOTE_QUERY_STOP_FAILED',
        message: 'stop failed',
      },
    ]);
  });
});
