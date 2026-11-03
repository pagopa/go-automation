import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AWSCloudWatchLogsQueryResult, ResultField } from '@go-automation/go-common/aws';
import { GOLogger } from '@go-automation/go-common/core';
import { RunbookEngine } from '../../../../core/RunbookEngine.js';
import { buildAnalysisDraft } from '../../../../output/buildAnalysisDraft.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import type { RunbookExecutionResult } from '../../../../types/RunbookExecutionResult.js';
import { assertCloudExecutableRunbook } from '../../../../validation/assertCloudExecutableRunbook.js';
import { assertAnalysisAnnotations } from '../../../../validation/assertAnalysisAnnotations.js';
import { ConditionEvaluator, type RunbookContext } from '../../framework.js';
import { KNOWN_CASES } from '../knownCases.js';
import { LAMBDA_FUNCTION } from '../knownServices.js';
import { JWT_AUTHORIZER_LAMBDA_LOG_INVOCATION_ERRORS_ALARM_REGISTRATION as REGISTRATION } from '../registration.js';
import { buildRunbook } from '../runbook.js';

const REQUEST_ID = '11111111-2222-4333-8444-555555555555';
const IAM_DENIED =
  'Error generating IAM policy  AccessDeniedException: User is not authorized to perform: apigateway:GET on resource: /tags/restapis/example';
const KMS_INVALID = "Error generating IAM policy  NotFoundException: Invalid keyId 'jwt_example'";
const KMS_MISSING =
  "Error generating IAM policy  NotFoundException: Key 'arn:aws:kms:us-west-2:111111111111:key/example' does not exist";
const CLUSTER_DOWN = 'Error checking JTI revocation: [ErrorReply: CLUSTERDOWN The cluster is down]';
const HASH_SLOT = 'Error checking JTI revocation: [ErrorReply: CLUSTERDOWN Hash slot not served]';
const SOCKET = `Uncaught Exception ${JSON.stringify({
  errorType: 'Error',
  errorMessage: 'Socket closed unexpectedly',
  stack: [
    'Error: Socket closed unexpectedly',
    'at TLSSocket (/var/task/node_modules/pn-auth-common/node_modules/@redis/client/dist/lib/client/socket.js:194:118)',
  ],
})}`;
const DISCONNECT = "Error disconnecting from Redis: TypeError: Cannot read properties of null (reading 'disconnect')";
const FIXTURES = [
  ['jwt-iam-api-gateway-access-denied', IAM_DENIED],
  ['jwt-kms-key-not-found', KMS_INVALID],
  ['jwt-kms-key-not-found', KMS_MISSING],
  ['jwt-redis-cluster-down', CLUSTER_DOWN],
  ['jwt-redis-cluster-down', HASH_SLOT],
  ['jwt-redis-socket-closed', SOCKET],
  ['jwt-redis-disconnect-null', DISCONNECT],
] as const;

interface Execution {
  readonly result: RunbookExecutionResult;
  readonly draft: ReturnType<typeof buildAnalysisDraft>;
  readonly queries: ReadonlyArray<string>;
  readonly sourceModes: ReadonlyArray<string | undefined>;
}

async function execute(
  errors: ReadonlyArray<string>,
  invocation: ReadonlyArray<string> = [],
  requestId: string = REQUEST_ID,
): Promise<Execution> {
  const queries: string[] = [];
  const sourceModes: (string | undefined)[] = [];
  const services = createTestServiceRegistry({
    cloudWatchLogs: {
      async queryWithStatistics(
        groups: ReadonlyArray<string>,
        query: string,
        _range: unknown,
        options?: { readonly logGroupResolutionMode?: string },
      ): Promise<AWSCloudWatchLogsQueryResult> {
        await Promise.resolve();
        assert.deepStrictEqual(groups, [LAMBDA_FUNCTION.logGroup]);
        queries.push(query);
        sourceModes.push(options?.logGroupResolutionMode);
        const isInvocation = query.includes(REQUEST_ID);
        const rows: ReadonlyArray<ReadonlyArray<ResultField>> = (isInvocation ? invocation : errors).map((message) => [
          { field: '@timestamp', value: '2026-10-13 05:39:20.757' },
          {
            field: '@message',
            value: isInvocation ? message : `2026-10-13T05:39:20.757Z\t${requestId}\tERROR\t${message}`,
          },
          ...(requestId ? [{ field: '@requestId', value: requestId }] : []),
        ]);
        return {
          rows,
          statistics: { bytesScanned: 1, recordsScanned: rows.length, recordsMatched: rows.length },
          queryExecutions: [],
        };
      },
    },
  });
  const runbook = buildRunbook();
  const result = await new RunbookEngine(new GOLogger()).execute(
    runbook,
    new Map([
      ['startTime', '2026-10-13T05:35:04.285Z'],
      ['endTime', '2026-10-13T05:45:04.285Z'],
    ]),
    services,
  );
  return { result, draft: buildAnalysisDraft(runbook, result), queries, sourceModes };
}

describe('JWT authorizer Lambda runbook', () => {
  it('registers a cloud executable read-only authorization Lambda with the original Confluence reference', () => {
    assert.strictEqual(REGISTRATION.product, 'SEND');
    assert.strictEqual(REGISTRATION.kind, 'LAMBDA');
    assert.deepStrictEqual(REGISTRATION.categories, ['AUTHORIZATION']);
    assert.deepStrictEqual(REGISTRATION.alarmNames, [REGISTRATION.key]);
    const runbook = buildRunbook();
    assert.deepStrictEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.strictEqual(LAMBDA_FUNCTION.eventSource, 'api-gateway-authorizer');
    assert.doesNotThrow(() => assertCloudExecutableRunbook(runbook));
    assert.doesNotThrow(() => assertAnalysisAnnotations(runbook, 'SEND'));
    assert.match(runbook.analysisDefaults?.links?.[0]?.url ?? '', /3028910156/u);
    assert.strictEqual(new Set(KNOWN_CASES.map(({ id }) => id)).size, 5);
    assert.strictEqual(new Set(KNOWN_CASES.map(({ priority }) => priority)).size, 5);
  });

  for (const [id, message] of FIXTURES) {
    it(`recognizes the documented ${id} signature and reconstructs its invocation`, async () => {
      const { result, draft, queries, sourceModes } = await execute(
        [message],
        [
          `REPORT RequestId: ${REQUEST_ID}\tDuration: 10 ms\tMemory Size: 128 MB\tMax Memory Used: 32 MB\tStatus: success`,
        ],
      );
      assert.strictEqual(result.status, 'completed');
      assert.deepStrictEqual(
        result.matchedCases.map((c) => c.id),
        [id],
      );
      assert.strictEqual(result.stepsExecuted, 5);
      assert.strictEqual(draft?.kind, 'KNOWN_CASE');
      assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
      assert.deepStrictEqual(draft.finalActions, []);
      assert.strictEqual(queries.length, 2);
      assert.ok(queries[1]?.includes(REQUEST_ID));
      assert.deepStrictEqual(sourceModes, ['search-configured-profiles', 'search-configured-profiles']);
      assert.strictEqual(result.finalContext.vars.get('lambdaRequestId'), REQUEST_ID);
      if (id === 'jwt-iam-api-gateway-access-denied') assert.strictEqual(draft.conclusionNotes, 'PN-20045');
      else assert.strictEqual(draft.conclusionNotes, 'Risoluzione non documentata.');
    });
  }

  it('matches a source signature found in the reconstructed invocation without adding a downstream query', async () => {
    const { result, draft, queries } = await execute(['Unrecognized authorizer error'], [KMS_INVALID]);
    assert.strictEqual(queries.length, 2);
    assert.deepStrictEqual(
      result.matchedCases.map((c) => c.id),
      ['jwt-kms-key-not-found'],
    );
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
  });

  it('can classify an error without a requestId while leaving the invocation evidence absent', async () => {
    const { result, draft, queries } = await execute([KMS_INVALID], [], '');
    assert.strictEqual(queries.length, 1);
    assert.strictEqual(result.finalContext.vars.get('lambdaInvocationLogCount'), '0');
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
  });

  it('does not promote a disconnect error into evidence that the Redis cluster was down', async () => {
    const { result } = await execute([DISCONNECT]);
    assert.deepStrictEqual(
      result.matchedCases.map((c) => c.id),
      ['jwt-redis-disconnect-null'],
    );
    const both = await execute([DISCONNECT, HASH_SLOT]);
    assert.strictEqual(both.result.matchedCases[0]?.id, 'jwt-redis-cluster-down');
  });

  it('keeps empty logs, unrelated errors and undocumented runtime failures unknown', async () => {
    for (const messages of [
      [],
      ['Error: unknown failure'],
      ['Task timed out after 30 seconds'],
      ['Runtime.OutOfMemory'],
    ]) {
      const { result, draft } = await execute(messages);
      assert.deepStrictEqual(result.matchedCases, []);
      assert.strictEqual(draft?.kind, 'UNKNOWN_CASE_CONTEXT');
    }
  });

  it('requires complete signatures on one evidence row and refuses generic AWS or socket errors', () => {
    const evaluator = new ConditionEvaluator();
    for (const messages of [
      ['AccessDeniedException: not authorized to perform: apigateway:GET on resource: /tags/example'],
      [IAM_DENIED.replace('apigateway:GET', 'kms:Decrypt')],
      [IAM_DENIED.replace('/tags/', '/unrelated/')],
      [
        'Error generating IAM policy',
        'AccessDeniedException: not authorized to perform: apigateway:GET on resource: /tags/example',
      ],
      [KMS_INVALID.replace('Error generating IAM policy', 'Error reading another service')],
      ['NotFoundException: Key does not exist'],
      ['Socket closed unexpectedly'],
      [SOCKET.replace('@redis/client', 'another/client')],
      ['Error checking JTI revocation: [ErrorReply: CLUSTERDOWN Unexpected variant]'],
    ]) {
      const context: RunbookContext = {
        executionId: 'jwt-negative-signature',
        startedAt: new Date('2026-10-13T05:39:20.757Z'),
        stepResults: new Map([['query-lambda-errors', messages.map((value) => [{ field: '@message', value }])]]),
        vars: new Map(),
        params: new Map(),
        logs: [],
        services: createTestServiceRegistry(),
        recoveredErrors: [],
      };
      for (const knownCase of KNOWN_CASES)
        assert.strictEqual(evaluator.evaluate(knownCase.condition, context), false, knownCase.id);
    }
  });

  it('does not extend PN-20045 or add remediation to the undocumented cases', () => {
    for (const knownCase of KNOWN_CASES) {
      assert.strictEqual(knownCase.analysis?.proposedStatus, 'IN_PROGRESS');
      assert.deepStrictEqual(knownCase.analysis?.finalActions, []);
      assert.deepStrictEqual(knownCase.analysis?.downstreams ?? [], []);
      assert.strictEqual(
        knownCase.analysis?.links?.some((link) => link.url.endsWith('/PN-20045')) ?? false,
        knownCase.id === 'jwt-iam-api-gateway-access-denied',
      );
    }
  });
});
