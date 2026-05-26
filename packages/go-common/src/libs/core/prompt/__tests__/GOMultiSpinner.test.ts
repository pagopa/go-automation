import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { GOMultiSpinner } from '../GOMultiSpinner.js';

describe('GOMultiSpinner', () => {
  let stdoutWriteMock: ReturnType<typeof mock.method>;

  beforeEach(() => {
    stdoutWriteMock = mock.method(process.stdout, 'write', () => true);
  });

  afterEach(() => {
    stdoutWriteMock.mock.restore();
  });

  it('starts a spin task', () => {
    const spinner = new GOMultiSpinner();
    spinner.spin('task1', 'Loading');
    assert.strictEqual(spinner.isActive(), true);
    assert.strictEqual(spinner.getActiveCount(), 1);
    spinner.stopAll();
  });

  it('removes a task', () => {
    const spinner = new GOMultiSpinner();
    spinner.spin('task1', 'Loading');
    spinner.remove('task1');
    assert.strictEqual(spinner.getActiveCount(), 0);
  });

  it('logs a message', () => {
    const spinner = new GOMultiSpinner();
    spinner.log('Log message');
    assert.ok(stdoutWriteMock.mock.callCount() >= 1);
  });

  it('single spinner mode backward compatibility', () => {
    const spinner = new GOMultiSpinner();
    spinner.start('Start message');
    assert.strictEqual(spinner.isActive(), true);
    spinner.updateMessage('Update message');
    spinner.stop('Stop message');
    assert.strictEqual(spinner.isActive(), false);
  });

  it('does not append newlines to live spinner frames', () => {
    const spinner = new GOMultiSpinner({ renderMode: 'live', frames: ['-'], interval: 60000 });

    try {
      spinner.start('Loading');
      spinner.updateMessage('Still loading');

      const writes = getStdoutWrites(stdoutWriteMock);
      assert.ok(writes.some((write: string) => write.includes('Loading') && !write.endsWith('\n')));
      assert.ok(writes.some((write: string) => write.includes('Still loading') && !write.endsWith('\n')));
      assert.strictEqual(
        writes.some((write: string) => write.includes('Loading\n') || write.includes('Still loading\n')),
        false,
      );
    } finally {
      spinner.stopAll();
    }
  });

  it('emits plain lines when live rendering is disabled', () => {
    const spinner = new GOMultiSpinner({ renderMode: 'plain' });

    spinner.start('Loading');
    spinner.updateMessage('Still loading');
    spinner.stop('Done');

    const writes = getStdoutWrites(stdoutWriteMock);
    assert.ok(writes.includes('Loading\n'));
    assert.ok(writes.includes('Done\n'));
    assert.strictEqual(writes.includes('Still loading\n'), false);
  });

  it('success single spinner', () => {
    const spinner = new GOMultiSpinner();
    spinner.start('Doing something');
    spinner.succeed('Completed');
    assert.strictEqual(spinner.isActive(), false);
  });

  it('fail single spinner', () => {
    const spinner = new GOMultiSpinner();
    spinner.start('Doing something');
    spinner.fail('Failed');
    assert.strictEqual(spinner.isActive(), false);
  });

  it('warn single spinner', () => {
    const spinner = new GOMultiSpinner();
    spinner.start('Doing something');
    spinner.warn('Warning');
    assert.strictEqual(spinner.isActive(), false);
  });

  it('info single spinner', () => {
    const spinner = new GOMultiSpinner();
    spinner.start('Doing something');
    spinner.info('Info');
    assert.strictEqual(spinner.isActive(), false);
  });

  it('multi spinner mode success', () => {
    const spinner = new GOMultiSpinner();
    spinner.spin('t1', 'Loading 1');
    spinner.spin('t2', 'Loading 2');
    spinner.succeed('t1', 'Done 1');
    assert.strictEqual(spinner.getActiveCount(), 1);
    spinner.stopAll();
  });

  it('multi spinner mode fail', () => {
    const spinner = new GOMultiSpinner();
    spinner.spin('t1', 'Loading 1');
    spinner.fail('t1', 'Oops');
    assert.strictEqual(spinner.getActiveCount(), 0);
  });

  it('sets indent', () => {
    const spinner = new GOMultiSpinner();
    spinner.setIndent(2);
    spinner.setIndent('  ');
    // We just verify it doesn't crash
    assert.ok(true);
  });
});

function getStdoutWrites(stdoutWriteMock: ReturnType<typeof mock.method>): string[] {
  return stdoutWriteMock.mock.calls.map((call) => String(call.arguments[0]));
}
