import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { KNOWN_ERRORS } from '../knownErrors.js';
import { createTestContext } from '../../../../../__tests__/helpers/createTestContext.js';
import { executeWithLogs } from '../../../../../__tests__/helpers/executeWithLogs.js';
import { matchingKnownErrorCodes } from '../../../../../__tests__/helpers/knownErrorMatching.js';
import { logRow } from '../../../../../__tests__/helpers/logRow.js';
import type { RunbookLogsExecution } from '../../../../../__tests__/helpers/RunbookLogsExecution.js';
import { LAMBDA_FUNCTION } from '../knownServices.js';
import { buildRunbook } from '../runbook.js';
import { treeNodeVars } from '../../../../../__tests__/helpers/treeNodeVars.js';

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
  ['SEND_LAMBDA_PJALLIEA_JWT-IAM-API-GAT-ACC-DEN', IAM_DENIED],
  ['SEND_LAMBDA_PJALLIEA_JWT-KMS-KEY-NOT-FOU', KMS_INVALID],
  ['SEND_LAMBDA_PJALLIEA_JWT-KMS-KEY-NOT-FOU', KMS_MISSING],
  ['SEND_LAMBDA_PJALLIEA_JWT-RED-CLU-DOW', CLUSTER_DOWN],
  ['SEND_LAMBDA_PJALLIEA_JWT-RED-CLU-DOW', HASH_SLOT],
  ['SEND_LAMBDA_PJALLIEA_JWT-RED-SOC-CLO', SOCKET],
  ['SEND_LAMBDA_PJALLIEA_JWT-RED-DIS-NUL', DISCONNECT],
] as const;

/** Runs the runbook: the error scan returns `errors`, the invocation query `invocation`. */
async function execute(
  errors: ReadonlyArray<string>,
  invocation: ReadonlyArray<string> = [],
  requestId: string = REQUEST_ID,
): Promise<RunbookLogsExecution> {
  return executeWithLogs(
    buildRunbook(),
    { startTime: '2026-10-13T05:35:04.285Z', endTime: '2026-10-13T05:45:04.285Z' },
    (query, [group = '']) => {
      assert.strictEqual(group, LAMBDA_FUNCTION.logGroup);
      const isInvocation = query.includes(REQUEST_ID);
      return (isInvocation ? invocation : errors).map((message) =>
        logRow({
          '@timestamp': '2026-10-13 05:39:20.757',
          '@message': isInvocation ? message : `2026-10-13T05:39:20.757Z\t${requestId}\tERROR\t${message}`,
          ...(requestId ? { '@requestId': requestId } : {}),
        }),
      );
    },
  );
}

describe('JWT authorizer Lambda runbook', () => {
  it('recognizes each documented signature and reconstructs its invocation', async () => {
    const report = `REPORT RequestId: ${REQUEST_ID}\tDuration: 10 ms\tMemory Size: 128 MB\tMax Memory Used: 32 MB\tStatus: success`;
    for (const [id, message] of FIXTURES) {
      const { result, draft, queries } = await execute([message], [report]);
      assert.deepStrictEqual(
        result.detections.map((c) => c.knownError.code),
        [id],
      );
      // The window (prepare, errors, invocations) and the steps of the invocation (parse, analysis, descent).
      assert.strictEqual(result.stepsExecuted, 6, id);
      assert.strictEqual(draft?.kind, 'KNOWN_CASE');
      assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
      assert.strictEqual(
        draft.conclusionNotes,
        id === 'SEND_LAMBDA_PJALLIEA_JWT-IAM-API-GAT-ACC-DEN' ? 'PN-20045' : 'Risoluzione non documentata.',
      );
      assert.strictEqual(queries.length, 2);
      assert.ok(queries[1]?.query.includes(REQUEST_ID));
      assert.ok(queries.every(({ resolutionMode }) => resolutionMode === 'search-configured-profiles'));
      assert.strictEqual(treeNodeVars(result).get('lambdaRequestId'), REQUEST_ID);
    }
  });

  it('matches a source signature found in the reconstructed invocation without adding a downstream query', async () => {
    const { result, draft, queries } = await execute(['Unrecognized authorizer error'], [KMS_INVALID]);
    assert.strictEqual(queries.length, 2);
    assert.deepStrictEqual(
      result.detections.map((c) => c.knownError.code),
      ['SEND_LAMBDA_PJALLIEA_JWT-KMS-KEY-NOT-FOU'],
    );
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
  });

  it('can classify an error without a requestId while leaving the invocation evidence absent', async () => {
    const { result, draft, queries } = await execute([KMS_INVALID], [], '');
    assert.strictEqual(queries.length, 1);
    assert.strictEqual(treeNodeVars(result).get('lambdaInvocationLogCount'), '0');
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
  });

  it('does not promote a disconnect error into evidence that the Redis cluster was down', async () => {
    const { result } = await execute([DISCONNECT]);
    assert.deepStrictEqual(
      result.detections.map((c) => c.knownError.code),
      ['SEND_LAMBDA_PJALLIEA_JWT-RED-DIS-NUL'],
    );
    const both = await execute([DISCONNECT, HASH_SLOT]);
    assert.strictEqual(both.result.detections[0]?.knownError.code, 'SEND_LAMBDA_PJALLIEA_JWT-RED-CLU-DOW');
  });

  it('keeps empty logs, unrelated errors and undocumented runtime failures unknown', async () => {
    for (const messages of [
      [],
      ['Error: unknown failure'],
      ['Task timed out after 30 seconds'],
      ['Runtime.OutOfMemory'],
    ]) {
      const { result, draft } = await execute(messages);
      assert.deepStrictEqual(result.detections, []);
      assert.strictEqual(draft?.kind, 'UNKNOWN_CASE_CONTEXT');
    }
  });

  it('requires complete signatures on one evidence row and refuses generic AWS or socket errors', () => {
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
      const context = createTestContext({
        stepResults: { 'query-lambda-errors': messages.map((value) => [{ field: '@message', value }]) },
      });
      assert.deepStrictEqual(matchingKnownErrorCodes(KNOWN_ERRORS, context), [], messages.join(' | '));
    }
  });
});
