import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createLambdaAlarmRunbook } from '../createLambdaAlarmRunbook.js';
import type { LambdaAlarmConfig } from '../../types/LambdaAlarmConfig.js';
import { DEFAULT_LAMBDA_PROFILE } from '../../profiles/DEFAULT_LAMBDA_PROFILE.js';
import { TEST_RUNBOOK_METADATA } from '../../../../../../__tests__/helpers/TEST_RUNBOOK_METADATA.js';

function baseConfig(overrides: Partial<LambdaAlarmConfig> = {}): LambdaAlarmConfig {
  return {
    id: 'pn-fooLambda-LogInvocationErrors-Alarm',
    metadata: TEST_RUNBOOK_METADATA,
    lambda: { name: 'pn-fooLambda', logGroup: '/aws/lambda/pn-fooLambda', varPrefix: 'foo' },
    knownErrors: [],
    queryProfile: DEFAULT_LAMBDA_PROFILE,
    product: 'SEND',
    ...overrides,
  };
}

describe('createLambdaAlarmRunbook', () => {
  it('rejects a replacement query with a noncanonical step id', () => {
    const wrongQuery = {
      id: 'wrong-id',
      label: 'Wrong',
      kind: 'data' as const,
      // eslint-disable-next-line @typescript-eslint/require-await
      async execute() {
        return { success: true, output: [] };
      },
    };
    assert.throws(
      () => createLambdaAlarmRunbook(baseConfig({ errorQueryStep: wrongQuery })),
      /errorQueryStep must use id "query-lambda-errors"/,
    );
    assert.throws(
      () => createLambdaAlarmRunbook(baseConfig({ invocationQueryStep: wrongQuery })),
      /invocationQueryStep must use id "query-lambda-invocation"/,
    );
  });

  it('adds a level for each downstream with logs, read by request id', () => {
    const runbook = createLambdaAlarmRunbook(
      baseConfig({
        downstreams: [{ name: 'pn-emd-integration', varPrefix: 'emd', logGroup: '/aws/ecs/pn-emd-integration' }],
        downstreamErrorPatterns: [{ pattern: 'External service pn-emd-integration', target: 'pn-emd-integration' }],
      }),
    );
    const level = runbook.tree?.levels.find(({ target }) => target === 'pn-emd-integration');
    assert.strictEqual(level?.read?.id, 'query-pn-emd-integration');
    assert.strictEqual(level.varPrefix, 'emd');
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

  it('rejects a known error referencing a non-wired step', () => {
    assert.throws(
      () =>
        createLambdaAlarmRunbook(
          baseConfig({
            knownErrors: [
              {
                code: 'k',
                description: 'd',
                condition: { type: 'contains', ref: 'steps.query-nope', regex: 'x' },
                action: { type: 'log', level: 'info', title: 'm' },
              },
            ],
          }),
        ),
      /not wired/,
    );
  });
});
