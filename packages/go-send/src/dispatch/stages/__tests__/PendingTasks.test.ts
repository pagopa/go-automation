import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { PendingTasks } from '../PendingTasks.js';

describe('PendingTasks', () => {
  it('drains tasks added while draining', async () => {
    const tasks = new PendingTasks();
    const done: string[] = [];
    tasks.track(
      (async (): Promise<void> => {
        await Promise.resolve();
        done.push('first');
        tasks.track(
          (async (): Promise<void> => {
            await new Promise<void>((resolve) => setImmediate(resolve));
            done.push('second');
          })(),
        );
      })(),
    );
    assert.equal(tasks.size, 1);
    await tasks.drain();
    assert.deepEqual(done, ['first', 'second']);
    assert.equal(tasks.size, 0);
  });
});
