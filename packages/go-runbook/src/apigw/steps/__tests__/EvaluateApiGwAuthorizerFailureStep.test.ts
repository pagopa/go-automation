import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ResultField } from '@go-automation/go-common/aws';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { Step } from '../../../types/Step.js';
import type { ServiceRegistry } from '../../../services/ServiceRegistry.js';
import { evaluateApiGwAuthorizerFailure } from '../EvaluateApiGwAuthorizerFailureStep.js';
import type { ApiGwAuthorizerFailureInfo } from '../EvaluateApiGwAuthorizerFailureStep.js';
import { API_GW_AUTHORIZER_LAMBDAS } from '../../authorizers/ApiGwAuthorizerLambdaRegistry.js';

function createContext(stepOutput: unknown): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    stepResults: new Map<string, unknown>([['query-api-gw-logs', stepOutput]]),
    vars: new Map(),
    params: new Map(),
    logs: [],
    services: {} as unknown as ServiceRegistry,
    recoveredErrors: [],
  };
}

function buildRow(fields: Record<string, string>): ResultField[] {
  return Object.entries(fields).map(([field, value]) => ({ field, value }));
}

function createStep(): Step<ApiGwAuthorizerFailureInfo | undefined> {
  return evaluateApiGwAuthorizerFailure({
    id: 'evaluate-authorizer',
    label: 'Evaluate authorizer',
    fromStep: 'query-api-gw-logs',
    check: {
      defaultAuthorizer: API_GW_AUTHORIZER_LAMBDAS['pn-ioAuthorizerLambda'],
    },
  });
}

describe('evaluateApiGwAuthorizerFailure', () => {
  it('continues when no row has authorizerStatus over the threshold', async () => {
    const step = createStep();
    const result = await step.execute(
      createContext([buildRow({ status: '500', authorizerStatus: '200', authorizerLatency: '10' })]),
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.next, undefined);
    assert.strictEqual(result.output, undefined);
    assert.strictEqual(result.vars?.['apiGwAuthorizerOutcome'], 'no-error');
    assert.strictEqual(result.vars?.['apiGwAuthorizerLambdaName'], 'pn-ioAuthorizerLambda');
    assert.strictEqual(result.vars?.['apiGwAuthorizerStatus'], '200');
    assert.strictEqual(result.vars?.['apiGwAuthorizerLatencyMs'], '10');
    assert.strictEqual(result.vars?.['apiGwAuthorizerTimeoutMs'], '5000');
  });

  it('resolves a timeout when authorizerStatus is >= 500 and latency reaches the lambda timeout', async () => {
    const step = createStep();
    const result = await step.execute(
      createContext([
        buildRow({
          status: '-',
          authorizerStatus: '500',
          authorizerLatency: '5000',
          authorizerRequestId: 'auth-req-1',
          path: '/foo',
          httpMethod: 'GET',
        }),
      ]),
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.next, 'resolve');
    assert.strictEqual(result.output?.outcome, 'timeout');
    assert.strictEqual(result.output?.failureType, 'timeout');
    assert.strictEqual(result.output?.lambdaName, 'pn-ioAuthorizerLambda');
    assert.strictEqual(result.vars?.['apiGwAuthorizerOutcome'], 'timeout');
    assert.strictEqual(result.vars?.['apiGwAuthorizerLatencyMs'], '5000');
    assert.strictEqual(result.vars?.['apiGwAuthorizerTimeoutMs'], '5000');
    assert.strictEqual(result.vars?.['apiGwAuthorizerRequestId'], 'auth-req-1');
    // terminationReason is owned by DecideNextStep and must stay within the
    // TerminationReason union. This step exposes the authorizer-specific
    // signal via apiGwAuthorizerOutcome / apiGwAuthorizerFailureType.
    assert.strictEqual(result.vars?.['terminationReason'], undefined);
  });

  it('resolves a generic authorizer error when latency is below timeout', async () => {
    const step = createStep();
    const result = await step.execute(
      createContext([
        buildRow({
          status: '-',
          authorizerStatus: '503',
          authorizerLatency: '1200',
          authorizerRequestId: 'auth-req-2',
        }),
      ]),
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.next, 'resolve');
    assert.strictEqual(result.output?.outcome, 'error');
    assert.strictEqual(result.output?.failureType, 'status-error');
    assert.strictEqual(result.vars?.['apiGwAuthorizerOutcome'], 'error');
    assert.strictEqual(result.vars?.['apiGwAuthorizerFailureType'], 'status-error');
    assert.strictEqual(result.vars?.['terminationReason'], undefined);
    assert.strictEqual(result.vars?.['apiGwAuthorizerRequestId'], 'auth-req-2');
  });

  it('continues when authorizerRequestId is present but authorizerStatus is missing', async () => {
    const step = createStep();
    const result = await step.execute(
      createContext([
        buildRow({
          status: '500',
          authorizerRequestId: 'auth-req-4',
          integrationRequestId: '-',
          integrationServiceStatus: '-',
          path: '/foo',
          httpMethod: 'PUT',
        }),
      ]),
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.next, undefined);
    assert.strictEqual(result.output, undefined);
    assert.strictEqual(result.vars?.['apiGwAuthorizerOutcome'], 'no-error');
    assert.strictEqual(result.vars?.['apiGwAuthorizerLambdaName'], 'pn-ioAuthorizerLambda');
    assert.strictEqual(result.vars?.['apiGwAuthorizerStatus'], '');
    assert.strictEqual(result.vars?.['apiGwAuthorizerRequestId'], 'auth-req-4');
    assert.strictEqual(result.vars?.['apiGwAuthorizerPath'], '/foo');
    assert.strictEqual(result.vars?.['apiGwAuthorizerHttpMethod'], 'PUT');
  });

  it('resolves a generic authorizer error when latency is missing', async () => {
    const step = createStep();
    const result = await step.execute(
      createContext([buildRow({ status: '-', authorizerStatus: '500', authorizerRequestId: 'auth-req-3' })]),
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.next, 'resolve');
    assert.strictEqual(result.output?.outcome, 'error');
    assert.strictEqual(result.vars?.['apiGwAuthorizerLatencyMs'], '');
  });

  it('prefers a timeout over an earlier generic authorizer error', async () => {
    const step = createStep();
    const result = await step.execute(
      createContext([
        buildRow({ status: '-', authorizerStatus: '500', authorizerLatency: '10' }),
        buildRow({ status: '-', authorizerStatus: '500', authorizerLatency: '5000' }),
      ]),
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output?.outcome, 'timeout');
    assert.strictEqual(result.vars?.['apiGwAuthorizerLatencyMs'], '5000');
  });

  it('uses route rules to select the authorizer timeout by path and method', async () => {
    const step = evaluateApiGwAuthorizerFailure({
      id: 'evaluate-authorizer',
      label: 'Evaluate authorizer',
      fromStep: 'query-api-gw-logs',
      check: {
        rules: [
          {
            pathPrefix: '/b2b',
            httpMethod: 'POST',
            authorizer: API_GW_AUTHORIZER_LAMBDAS['pn-b2bAuthorizerLambda'],
          },
        ],
      },
    });

    const result = await step.execute(
      createContext([
        buildRow({
          status: '-',
          authorizerStatus: '500',
          authorizerLatency: '25000',
          path: '/b2b/requests',
          httpMethod: 'post',
        }),
      ]),
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output?.outcome, 'timeout');
    assert.strictEqual(result.output?.lambdaName, 'pn-b2bAuthorizerLambda');
    assert.strictEqual(result.vars?.['apiGwAuthorizerTimeoutMs'], '25000');
  });

  it('returns failure when the upstream step output is missing', async () => {
    const step = evaluateApiGwAuthorizerFailure({
      id: 'evaluate-authorizer',
      label: 'Evaluate authorizer',
      fromStep: 'missing-step',
      check: {
        defaultAuthorizer: API_GW_AUTHORIZER_LAMBDAS['pn-ioAuthorizerLambda'],
      },
    });

    const result = await step.execute(createContext([]));
    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /Step output not found/);
  });
});
