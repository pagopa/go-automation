import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import { GOEventEmitterBase } from '../GOEventEmitterBase.js';

interface TestEventMap {
  sync: { readonly value: number };
  async: { readonly value: number };
}

class TestEmitter extends GOEventEmitterBase<TestEventMap> {
  public emitSync(payload: TestEventMap['sync']): void {
    this.emit('sync', payload);
  }

  public async emitAsyncEvent(payload: TestEventMap['async']): Promise<void> {
    await this.emitAsync('async', payload);
  }
}

describe('GOEventEmitterBase', () => {
  let consoleErrorMock: ReturnType<typeof mock.method>;

  beforeEach(() => {
    consoleErrorMock = mock.method(console, 'error', () => undefined);
  });

  afterEach(() => {
    consoleErrorMock.mock.restore();
  });

  it('registers, removes, and clears listeners', () => {
    const emitter = new TestEmitter();
    const handler = (): void => undefined;

    emitter.on('sync', handler);
    emitter.on('sync', handler);
    assert.strictEqual(emitter.listenerCount('sync'), 2);

    emitter.off('sync', handler);
    assert.strictEqual(emitter.listenerCount('sync'), 0);

    emitter.off('sync', handler);
    assert.strictEqual(emitter.listenerCount('sync'), 0);

    emitter.on('sync', handler);
    emitter.removeAllListeners('sync');
    assert.strictEqual(emitter.listenerCount('sync'), 0);

    emitter.on('sync', handler);
    emitter.on('async', async () => undefined);
    emitter.removeAllListeners();
    assert.strictEqual(emitter.listenerCount('sync'), 0);
    assert.strictEqual(emitter.listenerCount('async'), 0);
  });

  it('emits sync events in registration order and continues after thrown errors', () => {
    const emitter = new TestEmitter();
    const seen: number[] = [];

    emitter.on('sync', ({ value }) => {
      seen.push(value);
    });
    emitter.on('sync', () => {
      throw new Error('listener failed');
    });
    emitter.on('sync', ({ value }) => {
      seen.push(value * 10);
    });

    emitter.emitSync({ value: 2 });

    assert.deepStrictEqual(seen, [2, 20]);
    assert.strictEqual(consoleErrorMock.mock.callCount(), 1);
  });

  it('catches rejected promises returned by sync emit handlers', async () => {
    const emitter = new TestEmitter();

    emitter.on('sync', async () => {
      throw new Error('async listener failed');
    });

    emitter.emitSync({ value: 1 });
    await new Promise((resolve) => setImmediate(resolve));

    assert.strictEqual(consoleErrorMock.mock.callCount(), 1);
  });

  it('awaits async handlers and logs async failures without interrupting others', async () => {
    const emitter = new TestEmitter();
    const seen: number[] = [];

    emitter.on('async', async ({ value }) => {
      seen.push(value);
    });
    emitter.on('async', async () => {
      throw new Error('boom');
    });
    emitter.on('async', async ({ value }) => {
      seen.push(value * 10);
    });

    await emitter.emitAsyncEvent({ value: 3 });

    assert.deepStrictEqual(seen, [3, 30]);
    assert.strictEqual(consoleErrorMock.mock.callCount(), 1);
  });
});
