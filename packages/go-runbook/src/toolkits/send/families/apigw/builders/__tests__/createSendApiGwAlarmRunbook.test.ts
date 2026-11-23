import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import { GOLogger } from '@pagopa/go-common/logging';

import { createSendApiGwAlarmRunbook } from '../createSendApiGwAlarmRunbook.js';
import type { ApiGwAlarmConfig } from '../../types/ApiGwAlarmConfig.js';
import type { ApiGwExecutionLogAnalysisMode } from '../../../../../common/families/apigw/types/ApiGwExecutionLogAnalysisMode.js';
import { isApiGwRunbookContext } from '../../../../../common/families/apigw/output/ApiGwRunbookContext.js';
import { API_GW_AUTHORIZER_LAMBDAS } from '../../authorizers/ApiGwAuthorizerLambdaRegistry.js';
import type { Condition } from '../../../../../../engine/types/Condition.js';
import type { KnownCase } from '../../../../../../engine/types/KnownCase.js';
import type { StepResult } from '../../../../../../engine/types/StepResult.js';
import type { Runbook } from '../../../../../../engine/types/Runbook.js';
import type { TreeLevel } from '../../../../../../engine/types/TreeLevel.js';
import { treeNodeVars } from '../../../../../../__tests__/helpers/treeNodeVars.js';
import type { RunbookExecutionResult } from '../../../../../../engine/types/RunbookExecutionResult.js';
import type { ErrorTreeNode } from '../../../../../../engine/types/ErrorTreeNode.js';
import { RunbookEngine } from '../../../../../../engine/core/RunbookEngine.js';
import { SEND_API_GW_PROFILE } from '../../profiles/SEND_API_GW_PROFILE.js';
import { createTestServiceRegistry } from '../../../../../common/testing/createTestServiceRegistry.js';
import type { PipelineHook } from '../../../../../../engine/types/PipelineHook.js';
import type { ApiGwPipelineAnchor } from '../../types/ApiGwPipelineAnchor.js';
import { createTestContext } from '../../../../../../__tests__/helpers/createTestContext.js';
import { logRow } from '../../../../../../__tests__/helpers/logRow.js';
import { TEST_TIME_RANGE_PARAMS } from '../../../../../../__tests__/helpers/TEST_TIME_RANGE_PARAMS.js';

const ACCESS_LOG = '/aws/apigw/main';
const EXECUTION_LOG = 'API-Gateway-Execution-Logs_default/prod';
const AUTHORIZER_CHECK = { defaultAuthorizer: API_GW_AUTHORIZER_LAMBDAS['pn-ioAuthorizerLambda'] };

function baseConfig(overrides: Partial<ApiGwAlarmConfig> = {}): ApiGwAlarmConfig {
  return {
    id: 'test-runbook',
    metadata: {
      name: 'Test runbook',
      description: '',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: [],
    },
    apiGwLogGroup: ACCESS_LOG,
    // The entry service has an execution log group, so the execution-log branch is wired by default.
    entryService: { name: 'pn-a', logGroup: '/aws/ecs/pn-a', executionLogGroup: EXECUTION_LOG, varPrefix: 'a' },
    services: [{ name: 'pn-b', logGroup: '/aws/ecs/pn-b', varPrefix: 'b' }],
    knownUrls: [],
    knownCases: [],
    ...overrides,
  };
}

function stepIds(runbook: Runbook): ReadonlyArray<string> {
  return runbook.steps.map((descriptor) => descriptor.step.id);
}

/** The steps every request of the root level runs. */
function requestStepIds(runbook: Runbook): ReadonlyArray<string> {
  return (runbook.tree?.root.perNode ?? []).map((descriptor) => descriptor.step.id);
}

/** The level of a service. */
function serviceLevel(runbook: Runbook, service: string): TreeLevel | undefined {
  return runbook.tree?.levels.find((level) => level.target === service);
}

/** A `trace info` field of a pipeline step, rendered against the default time range. */
function traceField(runbook: Runbook, stepId: string, field: string): string {
  const step = runbook.steps.find((descriptor) => descriptor.step.id === stepId)?.step;
  return String(step?.getTraceInfo?.(createTestContext({ params: TEST_TIME_RANGE_PARAMS }))?.[field]);
}

function knownCase(id: string, condition: Condition): KnownCase {
  return { id, description: id, condition, action: { type: 'log', level: 'info', title: id } };
}

function hook(
  id: string,
  at: ApiGwPipelineAnchor,
  extra: Partial<PipelineHook<ApiGwPipelineAnchor>> = {},
): PipelineHook<ApiGwPipelineAnchor> {
  const execute = async (): Promise<StepResult> => {
    await Promise.resolve();
    return { success: true };
  };
  return { at, step: { id, label: id, kind: 'data', execute }, ...extra };
}

/** One logs query the runbook ran. */
interface LogsCall {
  readonly group: string;
  readonly query: string;
}

/** Answers a logs query of the runbook from its log group and query text. */
type LogsResponderFn = (group: string, query: string) => ReadonlyArray<GOLogsInsightsResultField[]>;

/** Runs the runbook of `config` on fake logs: `respond` answers each query by log group. */
async function run(
  config: ApiGwAlarmConfig,
  respond: LogsResponderFn,
): Promise<{ readonly result: RunbookExecutionResult; readonly calls: ReadonlyArray<LogsCall> }> {
  const calls: LogsCall[] = [];
  const services = createTestServiceRegistry({
    cloudWatchLogs: {
      query: async (
        groups: ReadonlyArray<string>,
        query: string,
      ): Promise<ReadonlyArray<GOLogsInsightsResultField[]>> => {
        await Promise.resolve();
        const group = groups[0] ?? '';
        calls.push({ group, query });
        return respond(group, query);
      },
    },
  });
  const params = new Map(Object.entries(TEST_TIME_RANGE_PARAMS));
  const result = await new RunbookEngine(new GOLogger()).execute(createSendApiGwAlarmRunbook(config), params, services);
  return { result, calls };
}

function groupsOf(calls: ReadonlyArray<LogsCall>): ReadonlyArray<string> {
  return calls.map((call) => call.group);
}

describe('createSendApiGwAlarmRunbook structure', () => {
  it('reads the window, then investigates each request and each service as levels, all silent', () => {
    const runbook = createSendApiGwAlarmRunbook(baseConfig());
    assert.deepStrictEqual(stepIds(runbook), [
      'prepare-api-gw-section',
      'query-api-gw-logs',
      'query-api-gw-execution-logs',
    ]);
    assert.deepStrictEqual(requestStepIds(runbook), [
      'parse-api-gw-errors',
      'stop-api-gw-execution-log-unresolved',
      'descend-api-gateway',
    ]);
    assert.deepStrictEqual(runbook.tree?.root.scopedSteps, ['query-api-gw-logs', 'query-api-gw-execution-logs']);
    assert.deepStrictEqual(
      runbook.tree?.levels.map((level) => [level.target, level.read?.id, level.perNode?.map(({ step }) => step.id)]),
      [
        ['pn-a', 'query-pn-a', ['descend-pn-a']],
        ['pn-b', 'query-pn-b', ['descend-pn-b']],
      ],
    );
    // Every step renders its own narrative: engine logging would double it.
    const descriptors = [
      ...runbook.steps,
      ...(runbook.tree?.root.perNode ?? []),
      ...(runbook.tree?.levels ?? []).flatMap((level) => level.perNode ?? []),
    ];
    assert.ok(descriptors.every((descriptor) => descriptor.silent === true));

    const bestEffort = createSendApiGwAlarmRunbook(baseConfig({ executionLogAnalysisMode: 'best-effort' }));
    assert.ok(stepIds(bestEffort).includes('query-api-gw-execution-logs'));
    assert.ok(!requestStepIds(bestEffort).includes('stop-api-gw-execution-log-unresolved'));
  });

  it('wires the authorizer gate after the parse of each request, with its known cases, when configured', () => {
    const runbook = createSendApiGwAlarmRunbook(
      baseConfig({
        authorizerFailureCheck: AUTHORIZER_CHECK,
        knownCases: [knownCase('demo', { type: 'exists', ref: 'vars.x' })],
      }),
    );
    assert.deepStrictEqual(requestStepIds(runbook).slice(0, 2), [
      'parse-api-gw-errors',
      'evaluate-api-gw-authorizer-failure',
    ]);
    const caseIds = runbook.knownCases.map((c) => c.id);
    assert.ok(['demo', 'api-gw-authorizer-timeout', 'api-gw-authorizer-error'].every((id) => caseIds.includes(id)));
  });

  it('accepts an entry-only configuration and forwards maxIterations', () => {
    const runbook = createSendApiGwAlarmRunbook(baseConfig({ services: [], maxIterations: 42 }));
    assert.deepStrictEqual(
      runbook.tree?.levels.map((level) => level.target),
      ['pn-a'],
    );
    assert.strictEqual(runbook.maxIterations, 42);
  });

  it('exposes the API Gateway runbookContext for output builders', () => {
    const { runbookContext } = createSendApiGwAlarmRunbook(baseConfig());

    assert.ok(isApiGwRunbookContext(runbookContext));
    assert.strictEqual(runbookContext.apiGwLogGroup, ACCESS_LOG);
    assert.strictEqual(runbookContext.queryProfileId, 'send');
    assert.deepStrictEqual(
      runbookContext.services.map((service) => service.name),
      ['pn-a', 'pn-b'],
    );
  });

  it('resolves {{minStatusCode}} at build time and wires the lower threshold only as an empty-result fallback', () => {
    for (const [overrides, status] of [
      [{}, 500],
      [{ minStatusCode: 400 }, 400],
    ] as const) {
      const query = traceField(createSendApiGwAlarmRunbook(baseConfig(overrides)), 'query-api-gw-logs', 'query');
      assert.match(
        query,
        new RegExp(
          `filter status >= ${status} or authorizerStatus >= ${status} or integrationServiceStatus >= ${status}`,
        ),
      );
      assert.doesNotMatch(query, /\{\{minStatusCode\}\}/);
    }

    const withFallback = createSendApiGwAlarmRunbook(baseConfig({ fallbackMinStatusCode: 400 }));
    assert.match(traceField(withFallback, 'query-api-gw-logs', 'query'), /status >= 500/);
    assert.match(traceField(withFallback, 'query-api-gw-logs', 'emptyResultFallbackQuery'), /status >= 400/);
  });

  it('builds the default unknown-case fallback from the services, or keeps a custom one', () => {
    const { fallbackAction } = createSendApiGwAlarmRunbook(baseConfig());
    assert.ok(fallbackAction.type === 'log');
    assert.strictEqual(fallbackAction.renderAs, 'unknown-case');
    const rows = new Map(fallbackAction.details);
    assert.strictEqual(rows.get('Errori API Gateway'), '{{vars.apiGwErrorCount}}');
    assert.strictEqual(rows.get('X-Ray Trace ID'), '{{vars.xRayTraceId}}');
    // One row per aspect, so a missing value drops just that row.
    assert.strictEqual(rows.get('pn-a — errore'), '{{vars.aErrorMsg}}');
    assert.strictEqual(rows.get('pn-b — errore'), '{{vars.bErrorMsg}}');
    assert.strictEqual(rows.get('pn-b — target'), '{{vars.bNextUrlTarget}}');

    const custom = { type: 'log', level: 'error', title: 'custom' } as const;
    assert.deepStrictEqual(createSendApiGwAlarmRunbook(baseConfig({ fallbackAction: custom })).fallbackAction, custom);
  });
});

describe('createSendApiGwAlarmRunbook hooks', () => {
  it('runs the hooks on each request, on each error of the entry service and after the entry read', () => {
    const runbook = createSendApiGwAlarmRunbook(
      baseConfig({
        hooks: [
          hook('pre-1', 'before-service-traversal', { continueOnFailure: true }),
          hook('enrich-entry', 'after-entry-analysis', { silent: true }),
          hook('after-read', 'after-entry-read'),
        ],
      }),
    );

    assert.deepStrictEqual(requestStepIds(runbook).slice(-2), ['pre-1', 'descend-api-gateway']);
    assert.strictEqual(runbook.tree?.root.perNode?.find((d) => d.step.id === 'pre-1')?.continueOnFailure, true);
    assert.deepStrictEqual(
      serviceLevel(runbook, 'pn-a')?.perNode?.map(({ step, silent }) => [step.id, silent]),
      [
        ['enrich-entry', true],
        ['descend-pn-a', true],
      ],
    );
    assert.deepStrictEqual(
      serviceLevel(runbook, 'pn-b')?.perNode?.map(({ step }) => step.id),
      ['descend-pn-b'],
    );
    assert.deepStrictEqual(
      runbook.tree?.root.afterDescend?.map(({ step }) => step.id),
      ['after-read'],
    );
  });

  it('rejects hook ids that clash with each other or with the canonical pipeline', () => {
    // Hooks share one id namespace, so the same id at two different anchors is still a duplicate.
    assert.throws(
      () =>
        createSendApiGwAlarmRunbook(
          baseConfig({ hooks: [hook('same', 'before-service-traversal'), hook('same', 'after-entry-analysis')] }),
        ),
      /hook id "same" is declared more than once/,
    );
    assert.throws(
      () => createSendApiGwAlarmRunbook(baseConfig({ hooks: [hook('descend-pn-a', 'after-entry-analysis')] })),
      /hook id "descend-pn-a" collides/,
    );
  });
});

describe('createSendApiGwAlarmRunbook validation', () => {
  const noExecutionLog = { name: 'pn-a', logGroup: '/aws/ecs/pn-a', varPrefix: 'a' };
  const cases: ReadonlyArray<readonly [string, Partial<ApiGwAlarmConfig>, RegExp]> = [
    [
      'duplicate service names',
      { services: [{ name: 'pn-a', logGroup: '/dup', varPrefix: 'dup' }] },
      /Duplicate service name/,
    ],
    [
      'an execution-log mode without the log group',
      { entryService: noExecutionLog, executionLogAnalysisMode: 'best-effort' },
      /executionLogAnalysisMode is set but execution logs are not enabled/,
    ],
    [
      'an execution-log group on a profile without the capability',
      {
        executionLogAnalysisMode: 'best-effort',
        queryProfile: {
          id: 'no-exec',
          accessLog: SEND_API_GW_PROFILE.accessLog,
          serviceLog: SEND_API_GW_PROFILE.serviceLog,
        },
      },
      /entryService\.executionLogGroup is set but the profile .* has no executionLog capability/,
    ],
    [
      'an unsupported execution-log mode received across an untyped boundary',
      { executionLogAnalysisMode: 'unsupported' as unknown as ApiGwExecutionLogAnalysisMode },
      /unsupported executionLogAnalysisMode 'unsupported'/,
    ],
  ];

  for (const [name, overrides, error] of cases) {
    it(`rejects ${name}`, () => {
      assert.throws(() => createSendApiGwAlarmRunbook(baseConfig(overrides)), error);
    });
  }

  it('rejects a fallback threshold that is not an integer HTTP error status below the main one', () => {
    for (const fallbackMinStatusCode of [500, 600, 399, 400.5, NaN]) {
      assert.throws(() => createSendApiGwAlarmRunbook(baseConfig({ fallbackMinStatusCode })), /fallbackMinStatusCode/);
    }
  });
});

const ORIGINAL_TRACE = '1-69b158e8-28c211881e5339480367ede0';
const FIRST_UUID = '11111111-1111-1111-1111-111111111111';
const SECOND_UUID = '22222222-2222-2222-2222-222222222222';

describe('createSendApiGwAlarmRunbook execution', () => {
  for (const useFallback of [true, false]) {
    it(`queries the selected downstream with ${useFallback ? 'its own fallback UUID' : 'the original trace when its UUID is missing'}`, async () => {
      const { result, calls } = await run(
        baseConfig({
          entryService: {
            name: 'pn-a',
            logGroup: '/aws/ecs/pn-a',
            varPrefix: 'a',
            queryOverride: "{{FILTER_CLAUSE}}\n| filter level = 'ERROR' or @message like 'Invoking'",
          },
          knownUrls: [
            { url: 'http://internal/service-a/', target: 'pn-a' },
            { url: 'http://internal/service-b/', target: 'pn-b' },
          ],
          knownCases: [
            knownCase('downstream-b-failure', { type: 'contains', ref: 'steps.query-pn-b', regex: 'Failure in B' }),
          ],
        }),
        (group) => {
          if (group === ACCESS_LOG) return [logRow({ status: '500', xrayTraceId: `Root=${ORIGINAL_TRACE}` })];
          if (group === '/aws/ecs/pn-a') {
            const uuid = useFallback ? ` FALLBACK-UUID:${SECOND_UUID}` : '';
            return [
              logRow({
                level: 'INFO',
                trace_id: ORIGINAL_TRACE,
                '@message': `Invoking http://internal/service-a/call FALLBACK-UUID:${FIRST_UUID}`,
              }),
              logRow({
                level: 'ERROR',
                trace_id: ORIGINAL_TRACE,
                '@message': `Error calling http://internal/service-b/call${uuid}`,
              }),
            ];
          }
          return [
            logRow({
              level: 'ERROR',
              ...(useFallback ? {} : { trace_id: ORIGINAL_TRACE }),
              '@message': `Failure in B${useFallback ? ` FALLBACK-UUID:${SECOND_UUID}` : ''}`,
            }),
          ];
        },
      );

      assert.deepStrictEqual(groupsOf(calls), [ACCESS_LOG, '/aws/ecs/pn-a', '/aws/ecs/pn-b']);
      const downstreamQuery = calls[2]?.query ?? '';
      assert.ok(downstreamQuery.includes(useFallback ? SECOND_UUID : ORIGINAL_TRACE));
      assert.ok(!downstreamQuery.includes(FIRST_UUID));
      if (useFallback) assert.ok(!downstreamQuery.includes(ORIGINAL_TRACE));
      assert.equal(result.detections[0]?.knownCase.id, 'downstream-b-failure');
    });
  }

  it('keeps every matching known case and still follows the KnownUrl target', async () => {
    const targetsB = { type: 'compare', ref: 'vars.aNextUrlTarget', operator: '==', value: 'pn-b' } as const;
    const { result, calls } = await run(
      baseConfig({
        knownCases: [knownCase('primary', targetsB), knownCase('secondary', targetsB)],
        knownUrls: [{ url: 'http://internal/pn-b/', target: 'pn-b' }],
      }),
      (group) =>
        group === ACCESS_LOG
          ? [logRow({ status: '500', xrayTraceId: 'Root=1-6ad1eae3-493a74b231f3e345492729e9' })]
          : [
              logRow({
                level: 'ERROR',
                trace_id: '1-6ad1eae3-493a74b231f3e345492729e9',
                '@message': 'boom calling http://internal/pn-b/resource',
              }),
            ],
    );

    assert.deepStrictEqual(
      result.detections.map((c) => c.knownCase.id),
      ['primary', 'secondary'],
    );
    // A known case no longer ends the traversal: the chain goes on to the downstream service.
    assert.deepStrictEqual(groupsOf(calls), [ACCESS_LOG, '/aws/ecs/pn-a', '/aws/ecs/pn-b']);
  });

  it('stops at the authorizer gate on a timeout, before execution logs and service traversal', async () => {
    const { result, calls } = await run(baseConfig({ authorizerFailureCheck: AUTHORIZER_CHECK }), (group) =>
      group === ACCESS_LOG
        ? [
            logRow({
              status: '-',
              authorizerStatus: '500',
              authorizerLatency: '5000',
              authorizerRequestId: 'auth-req-1',
              path: '/resource-a',
              httpMethod: 'GET',
            }),
          ]
        : [],
    );

    assert.deepStrictEqual(
      result.detections.map((c) => c.knownCase.id),
      ['api-gw-authorizer-timeout'],
    );
    assert.strictEqual(treeNodeVars(result).get('apiGwAuthorizerRequestId'), 'auth-req-1');
    assert.deepStrictEqual(groupsOf(calls), [ACCESS_LOG]);
  });

  it('continues past the authorizer gate when authorizerStatus is missing', async () => {
    const { result, calls } = await run(
      // Best effort: the execution log of the request does not end its chain.
      baseConfig({ authorizerFailureCheck: AUTHORIZER_CHECK, executionLogAnalysisMode: 'best-effort' }),
      (group) =>
        group === ACCESS_LOG
          ? [
              logRow({
                status: '500',
                authorizerRequestId: 'auth-req-2',
                requestId: 'api-gw-req-1',
                xrayTraceId: 'Root=1-abcdef01-234567890abcdef012345678',
              }),
            ]
          : [
              logRow({
                level: 'ERROR',
                trace_id: '1-abcdef01-234567890abcdef012345678',
                '@message': 'application error',
              }),
            ],
    );

    assert.deepStrictEqual(result.detections, []);
    assert.strictEqual(treeNodeVars(result).get('apiGwAuthorizerRequestId'), 'auth-req-2');
    // The request descended to the entry service and found an error nobody recognizes.
    assert.deepStrictEqual(
      result.chains?.map((group) => group.members[0]?.end),
      ['leaf'],
    );
    assert.strictEqual(result.tree?.length, 2);
    assert.deepStrictEqual(groupsOf(calls), [ACCESS_LOG, EXECUTION_LOG, '/aws/ecs/pn-a']);
  });

  it('queries the execution logs once for every unique requestId, before the service traversal', async () => {
    const failure = (requestId: string, path: string): GOLogsInsightsResultField[] =>
      logRow({ status: '500', errorMessage: 'Endpoint request timed out', requestId, path, httpMethod: 'GET' });
    const { result, calls } = await run(
      baseConfig({
        knownCases: [
          knownCase('execution-known-failure', {
            type: 'contains',
            ref: 'steps.query-api-gw-execution-logs',
            regex: 'ExecutionKnownFailure',
          }),
        ],
      }),
      (group, query) => {
        if (group === ACCESS_LOG) return [failure('req-a-1', '/a'), failure('req-a-2', '/a'), failure('req-b-1', '/b')];
        // Each line carries the request id of its request.
        return ['req-a-1', 'req-a-2', 'req-b-1']
          .filter((requestId) => query.includes(requestId))
          .map((requestId) =>
            logRow({
              '@timestamp': '2026-01-01T00:00:01.000Z',
              '@message': `(${requestId}) ${requestId === 'req-b-1' ? 'ExecutionKnownFailure' : 'execution detail'}`,
            }),
          );
      },
    );

    assert.deepStrictEqual(
      result.detections.map((c) => c.knownCase.id),
      ['execution-known-failure'],
    );
    // One AWS call for every requestId (OR clause), even when two failures share an endpoint.
    assert.deepStrictEqual(groupsOf(calls), [ACCESS_LOG, EXECUTION_LOG]);
    for (const requestId of ['req-a-1', 'req-a-2', 'req-b-1']) assert.ok(calls[1]?.query.includes(requestId));
  });

  it('stops before the X-Ray flow when the execution logs match no known case', async () => {
    const { result, calls } = await run(baseConfig(), (group) =>
      group === ACCESS_LOG
        ? [logRow({ status: '500', errorMessage: 'Endpoint request timed out', requestId: 'req-a', path: '/a' })]
        : [logRow({ '@timestamp': '2026-01-01T00:00:00.000Z', '@message': 'unknown execution detail' })],
    );

    assert.deepStrictEqual(result.detections, []);
    assert.strictEqual(treeNodeVars(result).get('terminationReason'), 'api-gw-execution-log-unresolved');
    assert.deepStrictEqual(groupsOf(calls), [ACCESS_LOG, EXECUTION_LOG]);
  });

  it('continues with the trace-id traversal when no requestId can be extracted for the execution logs', async () => {
    const trace = '1-abcdef01-234567890abcdef012345678';
    const { result, calls } = await run(baseConfig(), (group) => {
      if (group === ACCESS_LOG)
        return [
          logRow({
            status: '500',
            errorMessage: 'Endpoint request timed out',
            xrayTraceId: `Root=${trace}`,
            requestId: '-',
          }),
        ];
      if (group === '/aws/ecs/pn-a') return [logRow({ level: 'ERROR', '@message': `${trace} application error` })];
      return [];
    });

    assert.strictEqual(treeNodeVars(result).get('apiGwExecutionLogMode'), 'no-request-id');
    assert.strictEqual(treeNodeVars(result, 'pn-a').get('aErrorMsg'), `${trace} application error`);
    assert.deepStrictEqual(groupsOf(calls), [ACCESS_LOG, '/aws/ecs/pn-a']);
  });
});

describe('createSendApiGwAlarmRunbook execution log per request', () => {
  const executionStep = 'query-api-gw-execution-logs';

  /** A request in error of the access log. */
  function request(requestId: string, trace: string): GOLogsInsightsResultField[] {
    return logRow({
      status: '500',
      errorMessage: 'Endpoint request timed out',
      requestId,
      xrayTraceId: `Root=${trace}`,
    });
  }

  /** Answers a query with its rows and whether pages of its result were left unread; throws for a failed read. */
  type StatisticsResponderFn = (
    group: string,
    query: string,
  ) => { readonly rows: ReadonlyArray<GOLogsInsightsResultField[]>; readonly unread?: boolean };

  /** Runs the runbook on fake logs that report the rows of every physical query. */
  async function runWithStatistics(
    config: ApiGwAlarmConfig,
    respond: StatisticsResponderFn,
  ): Promise<{ readonly result: RunbookExecutionResult; readonly groups: ReadonlyArray<string> }> {
    const groups: string[] = [];
    const statistics = { bytesScanned: 0, recordsScanned: 0, recordsMatched: 0 };
    const services = createTestServiceRegistry({
      cloudWatchLogs: {
        queryWithStatistics: async (logGroups: ReadonlyArray<string>, query: string) => {
          await Promise.resolve();
          const group = logGroups[0] ?? '';
          groups.push(group);
          const { rows, unread } = respond(group, query);
          return {
            rows,
            statistics,
            queryExecutions: [
              {
                queryId: String(groups.length),
                profile: 'test',
                logGroups: [group],
                statistics,
                rowsReturned: rows.length,
                ...(unread === true ? { unreadPages: 'budget' as const } : {}),
              },
            ],
          };
        },
      },
    });
    const result = await new RunbookEngine(new GOLogger()).execute(
      createSendApiGwAlarmRunbook(config),
      new Map(Object.entries(TEST_TIME_RANGE_PARAMS)),
      services,
    );
    return { result, groups };
  }

  /** The root node of a request, with its variables. */
  function requestNode(
    result: RunbookExecutionResult,
    key: string,
  ): { readonly node: ErrorTreeNode; readonly vars: ReadonlyMap<string, string> } {
    const node = result.tree?.find((candidate) => candidate.parentId === undefined && candidate.key === key);
    assert.ok(node, `request ${key}`);
    return { node, vars: result.nodeContexts?.get(node.id)?.vars ?? new Map() };
  }

  it('gives each request the mode of its batch: complete, saturated, without request id', async () => {
    const { result } = await runWithStatistics(baseConfig({ executionLogMaxRequestIds: 1 }), (group, query) => {
      if (group === ACCESS_LOG) {
        return {
          rows: [
            request('req-ok', '1-abcdef01-000000000000000000000001'),
            request('req-sat', '1-abcdef01-000000000000000000000002'),
            request('-', '1-abcdef01-000000000000000000000003'),
          ],
        };
      }
      if (group === EXECUTION_LOG) {
        const id = query.includes('req-ok') ? 'req-ok' : 'req-sat';
        const count = id === 'req-sat' ? 10_000 : 1;
        return { rows: Array.from({ length: count }, () => logRow({ '@message': `(${id}) execution detail` })) };
      }
      return { rows: [] };
    });

    const complete = requestNode(result, 'req-ok');
    assert.strictEqual(complete.vars.get('apiGwExecutionLogMode'), 'queried');
    assert.strictEqual(complete.vars.get('terminationReason'), 'api-gw-execution-log-unresolved');
    assert.strictEqual(complete.node.incompleteEvidence, undefined);
    const saturated = requestNode(result, 'req-sat');
    assert.strictEqual(saturated.vars.get('apiGwExecutionLogMode'), 'incomplete');
    assert.strictEqual(saturated.vars.get('terminationReason'), undefined);
    assert.strictEqual(saturated.node.incompleteEvidence, true);
    assert.strictEqual(requestNode(result, 'row:2').vars.get('apiGwExecutionLogMode'), 'no-request-id');
    // The errors without request id leave the whole window incomplete, as before.
    assert.strictEqual(result.windowIncomplete, true);
    assert.deepStrictEqual(
      result.coverage
        .filter((entry) => entry.stepId === executionStep)
        .map((entry) => [entry.reason, entry.identifiers]),
      [
        ['saturated', [{ kind: 'requestId', value: 'req-sat' }]],
        ['skipped', undefined],
      ],
    );
  });

  it('names the requests of a single batch with an unread page: they are incomplete and go on', async () => {
    const { result, groups } = await runWithStatistics(baseConfig(), (group) => {
      if (group === ACCESS_LOG) {
        return {
          rows: [
            request('req-1', '1-abcdef01-000000000000000000000001'),
            request('req-2', '1-abcdef01-000000000000000000000002'),
          ],
        };
      }
      if (group === EXECUTION_LOG) return { rows: [logRow({ '@message': '(req-1) execution detail' })], unread: true };
      return { rows: [] };
    });

    for (const key of ['req-1', 'req-2']) {
      const { node, vars } = requestNode(result, key);
      assert.strictEqual(vars.get('apiGwExecutionLogMode'), 'incomplete', key);
      assert.strictEqual(vars.get('terminationReason'), undefined, key);
      assert.strictEqual(node.incompleteEvidence, true, key);
    }
    assert.strictEqual(result.windowIncomplete, false);
    assert.ok(groups.includes('/aws/ecs/pn-a'));
  });

  it('keeps the mode of the window when no batch answered, with the errors without request id skipped', async () => {
    const { result } = await runWithStatistics(baseConfig(), (group) => {
      if (group === EXECUTION_LOG) throw new Error('ThrottlingException');
      if (group === ACCESS_LOG) {
        return {
          rows: [
            request('req-1', '1-abcdef01-000000000000000000000001'),
            request('-', '1-abcdef01-000000000000000000000002'),
          ],
        };
      }
      return { rows: [] };
    });

    const { node, vars } = requestNode(result, 'req-1');
    assert.strictEqual(vars.get('apiGwExecutionLogMode'), 'unavailable');
    const reads = result.nodeContexts?.get(node.id)?.reads;
    assert.ok(reads);
    assert.strictEqual(reads.stateOf(executionStep), 'skipped');
    assert.strictEqual(reads.stateOf(executionStep, { kind: 'requestId', value: 'req-1' }), 'skipped');
    assert.strictEqual(reads.hasGapFor(executionStep, { kind: 'requestId', value: 'req-1' }), false);
    assert.strictEqual(requestNode(result, 'row:1').vars.get('apiGwExecutionLogMode'), 'no-request-id');
    assert.strictEqual(result.windowIncomplete, true);
  });
});
