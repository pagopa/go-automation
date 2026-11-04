import { describe, it } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';

import { GOPromptInterruptedError } from '../../prompt/GOPromptInterruptedError.js';
import { GOScript } from '../GOScript.js';
import type { GOScriptLifecycleHooks } from '../GOScriptOptions.js';

type ExitCode = number | string | null | undefined;

function createScript(hooks: GOScriptLifecycleHooks): GOScript {
  return new GOScript({
    metadata: { name: 'signal test', version: '1.0.0', description: 'signals', authors: ['test'] },
    config: { parameters: [] },
    logging: { console: false, file: false },
    hooks,
  });
}

/**
 * Replaces `process.exit` for the duration of the test and resolves with the
 * first exit code it receives.
 */
async function captureExit(t: TestContext): Promise<ExitCode> {
  return new Promise<ExitCode>((resolve) => {
    t.mock.method(process, 'exit', (code?: ExitCode): never => {
      resolve(code);
      // Test stub: the real process.exit never returns, the stub must.
      return undefined as never;
    });
  });
}

/**
 * Installs the signal handlers of `script` and invokes the one for `signal`
 * directly (no real signal is raised). Bracket access reaches the private
 * members on purpose: the handlers are an internal detail of `run()`.
 */
function raise(script: GOScript, signal: NodeJS.Signals): void {
  script['setupSignalHandlers']();
  const ref = script['signalHandlerRefs'].find((candidate) => candidate.signal === signal);
  assert.ok(ref !== undefined, `handler for ${signal} registered`);
  ref.handler();
}

describe('GOScript signal handlers', { skip: createScript({}).environment.isAWSManaged }, () => {
  it('exits with 128 + signal number after a successful cleanup', async (t) => {
    let cleaned = false;
    const script = createScript({
      onCleanup: () => {
        cleaned = true;
      },
    });
    const exit = captureExit(t);

    raise(script, 'SIGTERM');

    assert.equal(await exit, 143);
    assert.equal(cleaned, true);
    assert.equal(script['signalHandlerRefs'].length, 0, 'cleanup removed the handlers');
  });

  it('exits with 1 when onCleanup fails', async (t) => {
    const consoleError = t.mock.method(console, 'error', () => undefined);
    const script = createScript({
      onCleanup: () => {
        throw new Error('cleanup boom');
      },
    });
    const exit = captureExit(t);

    raise(script, 'SIGINT');

    assert.equal(await exit, 1);
    assert.equal(consoleError.mock.callCount(), 1, 'the cleanup error is logged');
    // The failed cleanup stopped before removing the handlers: remove them here.
    for (const { signal, handler } of script['signalHandlerRefs']) {
      process.removeListener(signal, handler);
    }
  });

  it('keeps cleanup() non-throwing on the normal lifecycle path', async (t) => {
    const consoleError = t.mock.method(console, 'error', () => undefined);
    const script = createScript({
      onCleanup: () => {
        throw new Error('cleanup boom');
      },
    });

    await assert.doesNotReject(script.cleanup());
    assert.equal(consoleError.mock.callCount(), 1);
  });
  it('exits with 130 after onCleanup when a prompt is interrupted by Ctrl+C', async (t) => {
    let cleaned = false;
    let onErrorCalls = 0;
    const script = createScript({
      onCleanup: () => {
        cleaned = true;
      },
      onError: () => {
        onErrorCalls++;
      },
    });
    const exit = captureExit(t);

    // The stubbed process.exit returns, so run() goes on and rethrows: ignore it.
    void script
      .run(() => {
        throw new GOPromptInterruptedError();
      })
      .catch(() => undefined);

    assert.equal(await exit, 130);
    assert.equal(cleaned, true, 'onCleanup ran before the exit');
    assert.equal(onErrorCalls, 0, 'an interruption is not an error');
  });

  it('exits with 1 when the cleanup after a Ctrl+C on a prompt fails', async (t) => {
    t.mock.method(console, 'error', () => undefined);
    const script = createScript({
      onCleanup: () => {
        throw new Error('cleanup boom');
      },
    });
    const exit = captureExit(t);

    void script
      .run(() => {
        throw new GOPromptInterruptedError();
      })
      .catch(() => undefined);

    assert.equal(await exit, 1);
    // The failed cleanup stopped before removing the handlers: remove them here.
    for (const { signal, handler } of script['signalHandlerRefs']) {
      process.removeListener(signal, handler);
    }
  });

  it('still rejects without exiting on any other error', async (t) => {
    const exit = t.mock.method(process, 'exit', (): never => undefined as never);
    const script = createScript({});

    await assert.rejects(
      script.run(() => {
        throw new Error('boom');
      }),
      /boom/,
    );
    assert.equal(exit.mock.callCount(), 0);
  });
});
