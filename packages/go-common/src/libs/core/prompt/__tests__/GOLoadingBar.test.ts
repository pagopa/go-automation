import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { GOLoadingBar } from '../GOLoadingBar.js';

describe('GOLoadingBar', () => {
  let stdoutWriteMock: any;

  beforeEach(() => {
    stdoutWriteMock = mock.method(process.stdout, 'write', () => true);
  });

  afterEach(() => {
    stdoutWriteMock.mock.restore();
  });

  it('starts the loading bar', () => {
    const bar = new GOLoadingBar({ width: 10 });
    bar.start('Loading');
    assert.strictEqual(bar.isActive(), true);
    assert.strictEqual(bar.getPercentage(), 0);
    assert.ok(stdoutWriteMock.mock.callCount() >= 1);
  });

  it('updates the loading bar', () => {
    const bar = new GOLoadingBar({ width: 10 });
    bar.start('Loading');
    bar.update(50);
    assert.strictEqual(bar.getPercentage(), 50);
    assert.ok(stdoutWriteMock.mock.callCount() >= 2);
  });

  it('caps percentage at 0 and 100', () => {
    const bar = new GOLoadingBar({ width: 10 });
    bar.start('Loading');
    bar.update(-10);
    assert.strictEqual(bar.getPercentage(), 0);
    bar.update(150);
    assert.strictEqual(bar.getPercentage(), 100);
  });

  it('stops the loading bar', () => {
    const bar = new GOLoadingBar({ width: 10 });
    bar.start('Loading');
    bar.stop();
    assert.strictEqual(bar.isActive(), false);
  });

  it('completes the loading bar', (context, done) => {
    const bar = new GOLoadingBar({ width: 10 });
    bar.start('Loading');
    bar.complete('Done');
    assert.strictEqual(bar.getPercentage(), 100);
    
    // Complete uses setTimeout, so we wait a bit
    setTimeout(() => {
      assert.strictEqual(bar.isActive(), false);
      done();
    }, 150);
  });

  it('fails the loading bar', () => {
    const bar = new GOLoadingBar({ width: 10 });
    bar.start('Loading');
    bar.fail('Error');
    assert.strictEqual(bar.isActive(), false);
  });
});
