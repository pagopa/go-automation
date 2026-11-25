import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOLoadingBar } from '../GOLoadingBar.js';

describe('GOLoadingBar', () => {
  it('starts at 0%, renders on every update and clamps the percentage to 0..100', (t) => {
    const write = t.mock.method(process.stdout, 'write', () => true);
    const bar = new GOLoadingBar({ width: 10 });

    bar.start('Loading');
    assert.strictEqual(bar.isActive(), true);
    assert.strictEqual(bar.getPercentage(), 0);
    const writesAfterStart = write.mock.callCount();
    assert.ok(writesAfterStart >= 1);

    bar.update(50);
    assert.strictEqual(bar.getPercentage(), 50);
    assert.ok(write.mock.callCount() > writesAfterStart);

    bar.update(-10);
    assert.strictEqual(bar.getPercentage(), 0);
    bar.update(150);
    assert.strictEqual(bar.getPercentage(), 100);
  });

  it('stops immediately on stop and fail, and ignores a stop once stopped', (t) => {
    t.mock.method(process.stdout, 'write', () => true);

    for (const end of [(bar: GOLoadingBar) => bar.stop(), (bar: GOLoadingBar) => bar.fail('Error')]) {
      const bar = new GOLoadingBar({ width: 10 });
      bar.start('Loading');
      end(bar);
      assert.strictEqual(bar.isActive(), false);
      bar.stop();
      assert.strictEqual(bar.isActive(), false);
    }
  });

  it('completes at 100% and stops once 100% has been shown', (t) => {
    const write = t.mock.method(process.stdout, 'write', () => true);
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const bar = new GOLoadingBar({ width: 10 });
    bar.start('Loading');

    bar.complete('Done');
    assert.strictEqual(bar.getPercentage(), 100);
    assert.strictEqual(bar.isActive(), true);

    t.mock.timers.tick(100);
    assert.strictEqual(bar.isActive(), false);
    assert.ok(write.mock.calls.some((call) => String(call.arguments[0]).includes('Done')));
  });
});
