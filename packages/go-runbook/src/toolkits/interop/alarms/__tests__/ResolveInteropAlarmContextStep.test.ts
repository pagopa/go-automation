import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ResolveInteropAlarmContextStep } from '../ResolveInteropAlarmContextStep.js';
import type { ResolveInteropAlarmContextFn } from '../ResolveInteropAlarmContextFn.js';
import { createTestContext } from '../../../../__tests__/helpers/createTestContext.js';
import { captureNarrative } from '../../../../__tests__/helpers/captureNarrative.js';

interface ExampleContext {
  readonly environment: string;
}

class ResolveExampleContextStep extends ResolveInteropAlarmContextStep<ExampleContext> {
  constructor(resolve: ResolveInteropAlarmContextFn<ExampleContext>) {
    super('resolve-example', 'Risoluzione esempio', resolve);
  }

  protected override resolver(): string {
    return 'example-context';
  }

  protected override familyName(): string {
    return 'example';
  }

  protected override describe(alarmContext: ExampleContext): ReadonlyArray<string> {
    return [`Ambiente: ${alarmContext.environment}`];
  }

  protected override contextVars(alarmContext: ExampleContext): Readonly<Record<string, string>> {
    return { exampleEnvironment: alarmContext.environment };
  }
}

describe('ResolveInteropAlarmContextStep', () => {
  it('resolves the context of the alarm, reports it and publishes it as output and vars', async () => {
    const { reporter, lines } = captureNarrative();
    const step = new ResolveExampleContextStep((alarmName) => ({ environment: alarmName.slice(-4) }));
    const result = await step.execute(createTestContext({ params: { alarmName: 'x-prod' }, services: { reporter } }));
    reporter.flush();

    assert.deepStrictEqual(result, {
      success: true,
      output: { environment: 'prod' },
      vars: { exampleEnvironment: 'prod' },
    });
    assert.ok(lines.some((line) => line.includes('Ambiente: prod')));
    assert.strictEqual(step.kind, 'control');
    assert.deepStrictEqual(step.getTraceInfo(createTestContext({ params: { alarmName: 'x-prod' } })), {
      alarmName: 'x-prod',
      resolver: 'example-context',
    });
  });

  it('fails without an alarm name and when the alarm is not one of the runbook', async () => {
    const step = new ResolveExampleContextStep(() => {
      throw new Error('Unsupported INTEROP alarm name');
    });
    assert.deepStrictEqual(await step.execute(createTestContext()), {
      success: false,
      error: 'Missing required parameter: alarmName',
    });
    const result = await step.execute(createTestContext({ params: { alarmName: 'other' } }));
    assert.strictEqual(
      result.error,
      'INTEROP example alarm context resolution failed (example-context): Unsupported INTEROP alarm name',
    );
  });
});
