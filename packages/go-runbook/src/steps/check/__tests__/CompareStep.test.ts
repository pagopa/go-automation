import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { ServiceRegistry } from '../../../services/ServiceRegistry.js';
import { CompareStep } from '../CompareStep.js';

function createContext(args: {
  readonly vars?: Record<string, string>;
  readonly params?: Record<string, string>;
  readonly stepResults?: ReadonlyArray<readonly [string, unknown]>;
}): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    stepResults: new Map<string, unknown>(args.stepResults ?? []),
    vars: new Map(Object.entries(args.vars ?? {})),
    params: new Map(Object.entries(args.params ?? {})),
    logs: [],
    services: {} as unknown as ServiceRegistry,
    recoveredErrors: [],
  };
}

describe('CompareStep', () => {
  it('succeeds when the resolved context value satisfies the comparison', async () => {
    const step = new CompareStep({
      id: 'check-count',
      label: 'Check count',
      leftRef: 'vars.count',
      operator: '>',
      rightValue: 5,
    });

    const result = await step.execute(createContext({ vars: { count: '10' } }));

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output, true);
  });

  it('fails when the resolved context value does not satisfy the comparison', async () => {
    const step = new CompareStep({
      id: 'check-status',
      label: 'Check status',
      leftRef: 'params.status',
      operator: '==',
      rightValue: '200',
    });

    const result = await step.execute(createContext({ params: { status: '500' } }));

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.output, false);
    assert.match(result.error ?? '', /"500" == "200" is false/);
  });

  it('fails clearly when the reference cannot be resolved', async () => {
    const step = new CompareStep({
      id: 'check-missing',
      label: 'Check missing',
      leftRef: 'steps.query.output.count',
      operator: '>=',
      rightValue: 1,
    });

    const result = await step.execute(createContext({}));

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.output, false);
    assert.match(result.error ?? '', /reference "steps\.query\.output\.count" resolved to undefined/);
  });
});
