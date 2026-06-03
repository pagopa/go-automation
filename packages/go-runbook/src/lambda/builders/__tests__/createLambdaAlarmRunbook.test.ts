import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createLambdaAlarmRunbook } from '../createLambdaAlarmRunbook.js';
import { isLambdaRunbookContext } from '../../output/LambdaRunbookContext.js';
import type { LambdaAlarmConfig } from '../../types/LambdaAlarmConfig.js';

function baseConfig(overrides: Partial<LambdaAlarmConfig> = {}): LambdaAlarmConfig {
  return {
    id: 'pn-fooLambda-LogInvocationErrors-Alarm',
    metadata: { name: 'ANALISI', description: '', version: '1.0.0', type: 'alarm-resolution', team: 'GO', tags: [] },
    lambda: { name: 'pn-fooLambda', logGroup: '/aws/lambda/pn-fooLambda', varPrefix: 'foo' },
    knownCases: [],
    ...overrides,
  };
}

describe('createLambdaAlarmRunbook', () => {
  it('builds a valid runbook with the canonical step ids', () => {
    const runbook = createLambdaAlarmRunbook(baseConfig());
    assert.strictEqual(runbook.metadata.id, 'pn-fooLambda-LogInvocationErrors-Alarm');
    const ids = runbook.steps.map((descriptor) => descriptor.step.id);
    assert.deepStrictEqual(ids, [
      'prepare-lambda-section',
      'query-lambda-errors',
      'parse-lambda-errors',
      'query-lambda-invocation',
    ]);
  });

  it('attaches a lambda runbook context', () => {
    const runbook = createLambdaAlarmRunbook(baseConfig());
    assert.ok(isLambdaRunbookContext(runbook.runbookContext));
  });

  it('adds a per-downstream query step', () => {
    const runbook = createLambdaAlarmRunbook(
      baseConfig({
        downstreams: [{ name: 'pn-emd-integration', varPrefix: 'emd', logGroup: '/aws/ecs/pn-emd-integration' }],
        downstreamErrorPatterns: [{ pattern: 'External service pn-emd-integration', target: 'pn-emd-integration' }],
      }),
    );
    const ids = runbook.steps.map((descriptor) => descriptor.step.id);
    assert.ok(ids.includes('query-pn-emd-integration'));
  });

  it('uses a default log fallback when none is provided', () => {
    const runbook = createLambdaAlarmRunbook(baseConfig());
    assert.strictEqual(runbook.fallbackAction.type, 'log');
  });
});
