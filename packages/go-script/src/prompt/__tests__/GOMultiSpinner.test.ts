import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { GOMultiSpinner } from '../GOMultiSpinner.js';

describe('GOMultiSpinner', () => {
  let stdoutWriteMock: ReturnType<typeof mock.method>;

  beforeEach(() => {
    stdoutWriteMock = mock.method(process.stdout, 'write', () => true);
  });

  afterEach(() => {
    stdoutWriteMock.mock.restore();
  });

  function stdoutWrites(): string[] {
    return stdoutWriteMock.mock.calls.map((call) => String(call.arguments[0]));
  }

  it('tracks every task until it completes, fails or is removed', () => {
    const spinner = new GOMultiSpinner();

    spinner.spin('t1', 'Loading 1');
    spinner.spin('t2', 'Loading 2');
    spinner.spin('t3', 'Loading 3');
    assert.strictEqual(spinner.isActive(), true);
    assert.strictEqual(spinner.getActiveCount(), 3);

    spinner.succeed('t1', 'Done 1');
    assert.strictEqual(spinner.getActiveCount(), 2);
    spinner.fail('t2', 'Oops');
    assert.strictEqual(spinner.getActiveCount(), 1);
    spinner.remove('t3');
    assert.strictEqual(spinner.getActiveCount(), 0);
  });

  it('ends the single spinner through stop, succeed, fail, warn and info', () => {
    const ends: ReadonlyArray<(spinner: GOMultiSpinner) => void> = [
      (s) => s.stop('Stop message'),
      (s) => s.succeed('Completed'),
      (s) => s.fail('Failed'),
      (s) => s.warn('Warning'),
      (s) => s.info('Info'),
    ];

    for (const end of ends) {
      const spinner = new GOMultiSpinner();
      spinner.start('Doing something');
      assert.strictEqual(spinner.isActive(), true);
      spinner.updateMessage('Still doing something');
      end(spinner);
      assert.strictEqual(spinner.isActive(), false);
    }
  });

  it('logs a message with a numeric or a literal indent', () => {
    const spinner = new GOMultiSpinner();

    spinner.setIndent(2);
    spinner.log('Two spaces');
    spinner.setIndent('> ');
    spinner.log('Literal');

    assert.deepStrictEqual(stdoutWrites(), ['  Two spaces\n', '> Literal\n']);
  });

  it('does not append newlines to live spinner frames', () => {
    const spinner = new GOMultiSpinner({ renderMode: 'live', frames: ['-'], interval: 60000 });

    try {
      spinner.start('Loading');
      spinner.updateMessage('Still loading');

      const writes = stdoutWrites();
      assert.ok(writes.some((write) => write.includes('Loading') && !write.endsWith('\n')));
      assert.ok(writes.some((write) => write.includes('Still loading') && !write.endsWith('\n')));
      assert.strictEqual(
        writes.some((write) => write.includes('Loading\n') || write.includes('Still loading\n')),
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

    const writes = stdoutWrites();
    assert.ok(writes.includes('Loading\n'));
    assert.ok(writes.includes('Done\n'));
    assert.strictEqual(writes.includes('Still loading\n'), false);
  });
});
