import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import { EvaluateApiGwAuthorizerFailureStep } from '../EvaluateApiGwAuthorizerFailureStep.js';
import type {
  ApiGwAuthorizerFailureInfo,
  EvaluateApiGwAuthorizerFailureConfig,
} from '../EvaluateApiGwAuthorizerFailureStep.js';
import type { StepResult } from '../../../../../../engine/types/StepResult.js';
import { API_GW_AUTHORIZER_LAMBDAS } from '../../../../../send/families/apigw/authorizers/ApiGwAuthorizerLambdaRegistry.js';
import { SEND_API_GW_PROFILE } from '../../../../../send/families/apigw/profiles/SEND_API_GW_PROFILE.js';
import { createTestContext } from '../../../../../../__tests__/helpers/createTestContext.js';
import { logRow } from '../../../../../../__tests__/helpers/logRow.js';

/** Evaluates the access-log rows with the SEND profile (the step has no product default). */
async function evaluate(
  rows: ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>,
  options: Partial<Pick<EvaluateApiGwAuthorizerFailureConfig, 'check' | 'fromStep'>> = {},
): Promise<StepResult<ApiGwAuthorizerFailureInfo | undefined>> {
  const step = new EvaluateApiGwAuthorizerFailureStep({
    schema: SEND_API_GW_PROFILE.accessLog.schema,
    queryProfileId: SEND_API_GW_PROFILE.id,
    id: 'evaluate-authorizer',
    label: 'Evaluate authorizer',
    fromStep: options.fromStep ?? 'query-api-gw-logs',
    check: options.check ?? { defaultAuthorizer: API_GW_AUTHORIZER_LAMBDAS['pn-ioAuthorizerLambda'] },
  });
  return step.execute(createTestContext({ stepResults: { 'query-api-gw-logs': rows } }));
}

describe('evaluateApiGwAuthorizerFailure', () => {
  it('continues when no row has authorizerStatus over the threshold', async () => {
    const result = await evaluate([logRow({ status: '500', authorizerStatus: '200', authorizerLatency: '10' })]);

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
    const result = await evaluate([
      logRow({
        status: '-',
        authorizerStatus: '500',
        authorizerLatency: '5000',
        authorizerRequestId: 'auth-req-1',
        path: '/foo',
        httpMethod: 'GET',
      }),
    ]);

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
    const result = await evaluate([
      logRow({
        status: '-',
        authorizerStatus: '503',
        authorizerLatency: '1200',
        authorizerRequestId: 'auth-req-2',
      }),
    ]);

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
    const result = await evaluate([
      logRow({
        status: '500',
        authorizerRequestId: 'auth-req-4',
        integrationRequestId: '-',
        integrationServiceStatus: '-',
        path: '/foo',
        httpMethod: 'PUT',
      }),
    ]);

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
    const result = await evaluate([
      logRow({ status: '-', authorizerStatus: '500', authorizerRequestId: 'auth-req-3' }),
    ]);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.next, 'resolve');
    assert.strictEqual(result.output?.outcome, 'error');
    assert.strictEqual(result.vars?.['apiGwAuthorizerLatencyMs'], '');
  });

  it('prefers a timeout over an earlier generic authorizer error', async () => {
    const result = await evaluate([
      logRow({ status: '-', authorizerStatus: '500', authorizerLatency: '10' }),
      logRow({ status: '-', authorizerStatus: '500', authorizerLatency: '5000' }),
    ]);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output?.outcome, 'timeout');
    assert.strictEqual(result.vars?.['apiGwAuthorizerLatencyMs'], '5000');
  });

  it('uses route rules to select the authorizer timeout by path and method', async () => {
    const result = await evaluate(
      [
        logRow({
          status: '-',
          authorizerStatus: '500',
          authorizerLatency: '25000',
          path: '/b2b/requests',
          httpMethod: 'post',
        }),
      ],
      {
        check: {
          rules: [
            { pathPrefix: '/b2b', httpMethod: 'POST', authorizer: API_GW_AUTHORIZER_LAMBDAS['pn-b2bAuthorizerLambda'] },
          ],
        },
      },
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output?.outcome, 'timeout');
    assert.strictEqual(result.output?.lambdaName, 'pn-b2bAuthorizerLambda');
    assert.strictEqual(result.vars?.['apiGwAuthorizerTimeoutMs'], '25000');
  });

  it('returns failure when the upstream step output is missing', async () => {
    const result = await evaluate([], { fromStep: 'missing-step' });
    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /Step output not found/);
  });
});
