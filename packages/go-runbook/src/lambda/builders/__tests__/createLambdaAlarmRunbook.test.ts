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
      'analyze-lambda-invocation',
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

  it('rejects a downstream error pattern with an invalid regex', () => {
    assert.throws(
      () =>
        createLambdaAlarmRunbook(
          baseConfig({
            downstreams: [{ name: 'pn-x', varPrefix: 'x' }],
            downstreamErrorPatterns: [{ pattern: '([', target: 'pn-x' }],
          }),
        ),
      /not a valid regex/,
    );
  });

  it('rejects a downstream pattern targeting an undeclared downstream', () => {
    assert.throws(
      () =>
        createLambdaAlarmRunbook(baseConfig({ downstreamErrorPatterns: [{ pattern: 'boom', target: 'pn-missing' }] })),
      /not a declared downstream/,
    );
  });

  it('rejects a duplicate downstream name', () => {
    assert.throws(
      () =>
        createLambdaAlarmRunbook(
          baseConfig({
            downstreams: [
              { name: 'pn-x', varPrefix: 'x' },
              { name: 'pn-x', varPrefix: 'x2' },
            ],
          }),
        ),
      /declared more than once/,
    );
  });

  it('rejects a known case referencing a non-wired step', () => {
    assert.throws(
      () =>
        createLambdaAlarmRunbook(
          baseConfig({
            knownCases: [
              {
                id: 'k',
                description: 'd',
                priority: 1,
                condition: { type: 'contains', ref: 'steps.query-nope', regex: 'x' },
                action: { type: 'log', level: 'info', message: 'm' },
              },
            ],
          }),
        ),
      /not wired/,
    );
  });
});
