import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ResultField, AWSCloudWatchLogsQueryOptions } from '@go-automation/go-common/aws';

import { createLambdaDurationProbePreSteps } from '../createLambdaDurationProbePreSteps.js';
import { SEND_API_GW_PROFILE } from '../../profiles/SEND_API_GW_PROFILE.js';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { ServiceRegistry } from '../../../services/ServiceRegistry.js';
import type { TimeRange } from '../../../types/TimeRange.js';

interface CapturedQueryCall {
  readonly logGroups: ReadonlyArray<string>;
  readonly query: string;
  readonly timeRange: TimeRange;
  readonly options: AWSCloudWatchLogsQueryOptions | undefined;
}

function makeContext(
  queryResults: ReadonlyArray<ReadonlyArray<ResultField>> = [],
  capturedCalls: CapturedQueryCall[] = [],
): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    stepResults: new Map(),
    vars: new Map(),
    params: new Map([
      ['startTime', '2026-01-01T00:00:00.000Z'],
      ['endTime', '2026-01-01T00:05:00.000Z'],
    ]),
    logs: [],
    services: {
      cloudWatchLogs: {
        query: async (
          logGroups: ReadonlyArray<string>,
          query: string,
          timeRange: TimeRange,
          options?: AWSCloudWatchLogsQueryOptions,
        ): Promise<ReadonlyArray<ReadonlyArray<ResultField>>> => {
          await Promise.resolve();
          capturedCalls.push({ logGroups, query, timeRange, options });
          return queryResults;
        },
      },
    } as unknown as ServiceRegistry,
    recoveredErrors: [],
  };
}

function row(fields: Record<string, string>): ResultField[] {
  return Object.entries(fields).map(([field, value]) => ({ field, value }));
}

describe('createLambdaDurationProbePreSteps', () => {
  it('creates the default SEND-compatible query and analyze pre-steps', () => {
    const descriptors = createLambdaDurationProbePreSteps({
      logGroup: '/aws/lambda/pn-ioAuthorizerLambda',
    });

    assert.strictEqual(descriptors.length, 2);
    assert.strictEqual(descriptors[0]?.step.id, 'query-io-authorizer-lambda');
    assert.strictEqual(descriptors[0]?.step.label, 'Query log pn-ioAuthorizerLambda (Livello 0)');
    assert.strictEqual(descriptors[0]?.continueOnFailure, true);
    assert.strictEqual(descriptors[0]?.silent, true);
    assert.strictEqual(descriptors[1]?.step.id, 'analyze-io-authorizer-lambda');
    assert.strictEqual(descriptors[1]?.step.label, 'Analisi log pn-ioAuthorizerLambda');
    assert.strictEqual(descriptors[1]?.continueOnFailure, true);
    assert.strictEqual(descriptors[1]?.silent, true);
  });

  it('renders threshold and trace metadata in the query step', () => {
    const [queryDescriptor] = createLambdaDurationProbePreSteps({
      logGroup: '/aws/lambda/custom',
      idPrefix: 'auth-probe',
      label: 'CustomAuthorizer',
      thresholdMs: 3000,
      traceMetadata: { queryProfileId: 'send' },
    });

    const traceInfo = queryDescriptor?.step.getTraceInfo?.(makeContext());
    assert.strictEqual(traceInfo?.['queryKind'], 'lambda-duration-probe');
    assert.strictEqual(traceInfo?.['identifierMode'], 'none');
    assert.strictEqual(traceInfo?.['probeId'], 'auth-probe');
    assert.strictEqual(traceInfo?.['queryProfileId'], 'send');
    assert.match(String(traceInfo?.['query']), /@duration >= 3000/);
    assert.deepStrictEqual(traceInfo?.['logGroups'], ['/aws/lambda/custom']);
  });

  it('passes search-configured-profiles to CloudWatch Logs execution', async () => {
    const capturedCalls: CapturedQueryCall[] = [];
    const [queryDescriptor] = createLambdaDurationProbePreSteps({
      logGroup: '/aws/lambda/pn-ioAuthorizerLambda',
    });

    await queryDescriptor?.step.execute(makeContext([], capturedCalls));

    assert.strictEqual(capturedCalls.length, 1);
    assert.strictEqual(capturedCalls[0]?.options?.logGroupResolutionMode, 'search-configured-profiles');
  });

  it('analyzes with the configured var prefix and schema', async () => {
    const descriptors = createLambdaDurationProbePreSteps({
      logGroup: '/aws/lambda/custom',
      idPrefix: 'custom-probe',
      label: 'CustomLambda',
      varPrefix: 'customLambda',
      schema: SEND_API_GW_PROFILE.serviceLog.schema,
    });
    const context = makeContext();
    const stepResults = context.stepResults as Map<string, unknown>;
    stepResults.set('query-custom-probe', [row({ level: 'ERROR', '@message': 'Service returned timeout' })]);

    const result = await descriptors[1]?.step.execute(context);

    assert.strictEqual(result?.success, true);
    assert.strictEqual(result?.vars?.['customLambdaErrorMsg'], 'Service returned timeout');
    assert.strictEqual(result?.vars?.['customLambdaLogCount'], '1');
  });

  it('rejects invalid configuration at build time', () => {
    assert.throws(() => createLambdaDurationProbePreSteps({ logGroup: ' ' }), /logGroup must be a non-empty string/);
    assert.throws(
      () => createLambdaDurationProbePreSteps({ logGroup: '/aws/lambda/x', thresholdMs: 0 }),
      /thresholdMs must be a positive finite number/,
    );
    assert.throws(
      () => createLambdaDurationProbePreSteps({ logGroup: '/aws/lambda/x', queryTemplate: 'fields @message' }),
      /queryTemplate must contain \{\{THRESHOLD_MS\}\}/,
    );
    assert.throws(
      () =>
        createLambdaDurationProbePreSteps({
          logGroup: '/aws/lambda/x',
          schema: { messageFieldCandidates: [], levelField: 'level', traceIdField: 'trace_id' },
        }),
      /schema\.messageFieldCandidates must contain at least one field/,
    );
  });
});
