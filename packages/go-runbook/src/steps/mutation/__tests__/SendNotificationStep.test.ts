import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RunbookContext } from '../../../types/RunbookContext.js';
import { createTestServiceRegistry, type TestServiceOverrides } from '../../../registry/createTestServiceRegistry.js';
import { SendNotificationStep } from '../SendNotificationStep.js';

function createContext(args: {
  readonly vars?: Record<string, string>;
  readonly params?: Record<string, string>;
  readonly services?: TestServiceOverrides;
}): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    stepResults: new Map<string, unknown>(),
    vars: new Map(Object.entries(args.vars ?? {})),
    params: new Map(Object.entries(args.params ?? {})),
    logs: [],
    services: createTestServiceRegistry(args.services ?? {}),
    recoveredErrors: [],
  };
}

/** Body run while `process.stdout.write` is intercepted. */
type StdoutCapturedRunFn = () => Promise<void>;

/**
 * Runs `run` with `process.stdout.write` intercepted and returns what it wrote.
 * The original writer is restored even when `run` throws.
 */
async function captureStdout(run: StdoutCapturedRunFn): Promise<ReadonlyArray<string>> {
  const written: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: string): boolean => {
    written.push(chunk);
    return true;
  };

  try {
    await run();
  } finally {
    process.stdout.write = original;
  }

  return written;
}

describe('SendNotificationStep', () => {
  it('writes the interpolated message tagged with the channel', async () => {
    const step = new SendNotificationStep({
      id: 'notify',
      label: 'Notify',
      channel: 'slack',
      message: 'Alarm {{params.alarmName}} resolved for {{vars.service}}',
    });

    let result: Awaited<ReturnType<typeof step.execute>> | undefined;
    const written = await captureStdout(async () => {
      result = await step.execute(
        createContext({ vars: { service: 'pn-delivery' }, params: { alarmName: 'B2B-ApiGwAlarm' } }),
      );
    });

    assert.strictEqual(result?.success, true);
    assert.deepStrictEqual(written, ['[notification:slack] Alarm B2B-ApiGwAlarm resolved for pn-delivery\n']);
  });

  it('leaves an unresolved placeholder verbatim, unlike TemplateStep which blanks it', async () => {
    const step = new SendNotificationStep({
      id: 'notify',
      label: 'Notify',
      channel: 'console',
      message: 'service=[{{vars.missing}}]',
    });

    const written = await captureStdout(async () => {
      await step.execute(createContext({}));
    });

    assert.deepStrictEqual(written, ['[notification:console] service=[{{vars.missing}}]\n']);
  });
});
