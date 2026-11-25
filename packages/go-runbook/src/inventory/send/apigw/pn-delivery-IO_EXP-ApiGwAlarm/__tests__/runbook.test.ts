import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import type { RunbookExecutionResult } from '../../../../../engine/index.js';
import { buildRunbookOutput, type KnownCaseAnalysisDraft } from '../../../../../toolkits/send/index.js';
import { buildRunbook } from '../runbook.js';
import { KNOWN_CASES } from '../knownCases.js';
import { API_GW_LOG_GROUP } from '../knownServices.js';
import { createTestContext } from '../../../../../__tests__/helpers/createTestContext.js';
import { executeWithLogs } from '../../../../../__tests__/helpers/executeWithLogs.js';
import { caseMatches, knownCaseById } from '../../../../../__tests__/helpers/knownCaseMatching.js';
import type { LoggedQuery } from '../../../../../__tests__/helpers/LoggedQuery.js';
import { treeNodeVars } from '../../../../../__tests__/helpers/treeNodeVars.js';

const ROOT = '1-6ad0dd73-32533ff75fc4602939265354';
const REQUEST = '42e21ca4-bb03-4597-9af8-e80691ca0d80';
const OTHER_REQUEST = '7388b958-f570-4d9a-9146-304bfcc48b0c';
const INVOCATION_504 = 'Lambda invocation failed with status: 504. Lambda request id: N/A';
const AUTHORIZER_ERROR = 'Gateway response type: AUTHORIZER_CONFIGURATION_ERROR with status code: 500';
const FALLBACK = '11111111-1111-1111-1111-111111111111';
const EXECUTION_GROUP = 'API-Gateway-Execution-Logs_64pohg7bg0/unique';
const row = (values: Record<string, string>): ReadonlyArray<GOLogsInsightsResultField> =>
  Object.entries(values).map(([field, value]) => ({ field, value }));
const access = (values: Record<string, string> = {}): ReadonlyArray<GOLogsInsightsResultField> =>
  row({
    xrayTraceId: `Root=${ROOT}`,
    requestId: REQUEST,
    errorMessage: 'Internal server error',
    status: '500',
    authorizerStatus: '200',
    httpMethod: 'GET',
    path: '/delivery/notifications/received/EXAMPLE',
    ...values,
  });

async function execute(
  accessRow: ReadonlyArray<GOLogsInsightsResultField>,
  executionMessages: ReadonlyArray<string | { requestId: string; message: string }> | Error = [],
  application: Record<string, ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>> = {},
  additionalAccessRows: ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>> = [],
): Promise<{
  result: RunbookExecutionResult;
  draft: KnownCaseAnalysisDraft;
  calls: ReadonlyArray<LoggedQuery>;
}> {
  const { result, draft, queries } = await executeWithLogs(
    buildRunbook(),
    { startTime: '2026-10-15T14:00:18Z', endTime: '2026-10-15T14:10:19Z' },
    (_query, [group = '']) => {
      if (group === API_GW_LOG_GROUP) return [accessRow, ...additionalAccessRows];
      if (group !== EXECUTION_GROUP) return application[group] ?? [];
      if (executionMessages instanceof Error) throw executionMessages;
      return executionMessages.map((entry) =>
        row({
          '@message': typeof entry === 'string' ? `(${REQUEST}) ${entry}` : `(${entry.requestId}) ${entry.message}`,
        }),
      );
    },
  );
  assert.strictEqual(result.status, 'completed');
  assert.strictEqual(draft?.kind, 'KNOWN_CASE');
  return { result, draft, calls: queries };
}

function matches(id: string, stepId: string, message: string): boolean {
  return caseMatches(
    knownCaseById(KNOWN_CASES, id),
    createTestContext({ stepResults: { [stepId]: [row({ '@message': message })] } }),
  );
}

describe('IO_EXP diagnosis', () => {
  it('reads execution logs before distinguishing invocation 504 from a Lambda handler timeout', async () => {
    const { result, draft, calls } = await execute(
      access({ authorizerStatus: '500', authorizerLatency: '10000', authorizerRequestId: '-' }),
      [
        'Lambda invocation failed with status: 504. Lambda request id: N/A',
        'Execution failed due to configuration error: Authorizer error',
        'Gateway response type: AUTHORIZER_CONFIGURATION_ERROR with status code: 500',
      ],
    );
    assert.strictEqual(result.detections[0]?.knownCase.id, 'authorizer-invocation-504');
    // A known case does not end the traversal: Delivery is still read for the same request.
    assert.deepStrictEqual(
      calls.map((c) => c.groups[0]),
      [API_GW_LOG_GROUP, EXECUTION_GROUP, '/aws/ecs/pn-delivery'],
    );
    assert.strictEqual(draft?.proposedStatus, 'IN_PROGRESS');
    const evidence = buildRunbookOutput(buildRunbook(), result).context.evidence;
    assert.strictEqual(evidence.length, 1);
    assert.strictEqual(evidence[0]?.sourceStep, 'query-api-gw-execution-logs');
    assert.strictEqual(evidence[0]?.items?.length, 3);
    assert.ok(evidence[0]?.items?.every((item) => item['requestId'] === REQUEST));
    assert.ok(evidence[0]?.items?.some((item) => item['message']?.includes(INVOCATION_504)));
  });

  it('distinguishes integration signature failure after successful authorization from generic configuration errors', async () => {
    const { result, draft } = await execute(access({ httpMethod: 'POST', integrationServiceStatus: '403' }), [
      'Successfully completed authorizer execution',
      'Lambda invocation failed with status: 403. Lambda request id: integration-request',
      'Execution failed due to configuration error: The request signature we calculated does not match the signature you provided. Check your AWS Secret Access Key and signing method.',
    ]);
    assert.strictEqual(result.detections[0]?.knownCase.id, 'integration-signature-mismatch');
    assert.strictEqual(draft?.proposedStatus, 'IN_PROGRESS');
  });

  it('does not combine an integration 504 with an authorizer configuration error from another request', async () => {
    const { result } = await execute(
      access(),
      [
        { requestId: REQUEST, message: INVOCATION_504 },
        { requestId: OTHER_REQUEST, message: AUTHORIZER_ERROR },
      ],
      {},
      [access({ requestId: OTHER_REQUEST, authorizerStatus: '500' })],
    );
    assert.strictEqual(result.detections[0]?.knownCase.id, 'authorizer-configuration-error');
    assert.ok(!result.detections.some(({ knownCase }) => knownCase.id === 'authorizer-invocation-504'));
  });

  it('recognizes signatures in the same request despite interleaved requests and reversed log order', async () => {
    const messages = [
      { requestId: REQUEST, message: INVOCATION_504 },
      { requestId: OTHER_REQUEST, message: AUTHORIZER_ERROR },
      { requestId: REQUEST, message: AUTHORIZER_ERROR },
    ];
    for (const executionMessages of [messages, [...messages].reverse()]) {
      const { result } = await execute(access({ authorizerStatus: '500' }), executionMessages, {}, [
        access({ requestId: OTHER_REQUEST }),
      ]);
      assert.strictEqual(result.detections[0]?.knownCase.id, 'authorizer-invocation-504');
    }
  });

  it('does not correlate execution signatures whose request IDs are missing or unknown', async () => {
    const missing = await execute(access({ authorizerStatus: '500' }), [
      { requestId: '', message: INVOCATION_504 },
      { requestId: '', message: AUTHORIZER_ERROR },
    ]);
    // Lines without the request id belong to no request: only the access log speaks for it.
    const missingIds = missing.result.detections.map(({ knownCase }) => knownCase.id);
    assert.strictEqual(missingIds[0], 'authorizer-access-log-failure');
    assert.ok(!missingIds.includes('authorizer-configuration-error'));
    assert.ok(!missingIds.includes('authorizer-invocation-504'));

    // Lines of a request that was not looked up are not evidence of this investigation.
    const unknown = await execute(access({ authorizerStatus: '500' }), [
      { requestId: 'unrequested-id', message: INVOCATION_504 },
      { requestId: 'unrequested-id', message: AUTHORIZER_ERROR },
    ]);
    const ids = unknown.result.detections.map(({ knownCase }) => knownCase.id);
    assert.ok(!ids.includes('authorizer-configuration-error'));
    assert.ok(!ids.includes('authorizer-invocation-504'));
  });

  it('retains an unresolved authorizer diagnosis and declares the execution logs unavailable when they cannot be read', async () => {
    const { result, draft, calls } = await execute(
      access({ authorizerStatus: '500', authorizerLatency: '10000' }),
      new Error('AccessDeniedException'),
    );
    assert.strictEqual(result.detections[0]?.knownCase.id, 'authorizer-access-log-failure');
    assert.strictEqual(treeNodeVars(result).get('apiGwExecutionLogMode'), 'unavailable');
    assert.deepStrictEqual(
      result.coverage.map(({ source, reason, detail }) => ({ source, reason, detail })),
      [{ source: EXECUTION_GROUP, reason: 'unavailable', detail: 'AccessDeniedException' }],
    );
    assert.strictEqual(draft?.proposedStatus, 'IN_PROGRESS');
    assert.ok(calls.some((c) => c.groups[0] === '/aws/ecs/pn-delivery'));
  });

  it('does not assume that an integration 502 proves Delivery unavailability', async () => {
    const { result, draft, calls } = await execute(access({ integrationServiceStatus: '502' }));
    assert.ok(calls.some((c) => c.groups[0] === EXECUTION_GROUP));
    assert.strictEqual(result.detections[0]?.knownCase.id, 'integration-502');
    assert.strictEqual(draft?.proposedStatus, 'IN_PROGRESS');
  });

  it('continues past inconclusive execution logs and follows Delivery to Data Vault using the full root', async () => {
    const { result, calls, draft } = await execute(access(), ['Method completed with status: 500'], {
      '/aws/ecs/pn-delivery': [
        row({
          level: 'ERROR',
          trace_id: ROOT,
          '@message': `pn-exception 500 FALLBACK-UUID:${FALLBACK} Request to GET http://internal.example:8080/datavault-private/v1/recipients/internal`,
        }),
      ],
      '/aws/ecs/pn-data-vault-sep': [
        row({
          level: 'WARN',
          trace_id: ROOT,
          '@message':
            'WebClientResponseException$InternalServerError: 500 Internal Server Error from GET https://api.pdv.pagopa.it/user-registry/v1/users/<userId>',
        }),
      ],
    });
    assert.strictEqual(result.detections[0]?.knownCase.id, 'downstream-pdv-500-internal-server-error');
    const query = calls.find((c) => c.groups[0] === '/aws/ecs/pn-data-vault-sep')?.query ?? '';
    assert.ok(query.includes(ROOT));
    assert.ok(!query.includes(FALLBACK));
    assert.ok(query.includes("level = 'WARN'"));
    assert.strictEqual(treeNodeVars(result, 'pn-delivery').get('deliveryFallbackUuid'), FALLBACK);
    assert.strictEqual(draft?.proposedStatus, 'IN_PROGRESS');
  });

  it('requires PDV evidence in the downstream service and the specific F24 metadata Gone signature', () => {
    const pdv = '[DOWNSTREAM] Service PersonalDataVault_UserRegistry returned errors=500 Internal Server Error';
    assert.strictEqual(matches('downstream-pdv-500-internal-server-error', 'query-pn-data-vault', pdv), true);
    assert.strictEqual(matches('downstream-pdv-500-internal-server-error', 'query-pn-delivery', pdv), false);
    assert.strictEqual(
      matches(
        'f24-metadata-gone',
        'query-pn-f24',
        '410 Gone from GET http://internal.example:8080/safe-storage/v1/files/PN_F24_META-example.json',
      ),
      true,
    );
    assert.strictEqual(
      matches('f24-metadata-gone', 'query-pn-f24', '410 Gone from GET https://unrelated.example/file'),
      false,
    );
  });

  it('follows the F24 invocation for the historical metadata case without assuming expiration from status alone', async () => {
    const { result, draft } = await execute(access(), [], {
      '/aws/ecs/pn-delivery': [
        row({ level: 'ERROR', trace_id: ROOT, '@message': 'GET http://internal.example:8080/f24-private/pdf/EXAMPLE' }),
      ],
      '/aws/ecs/pn-f24': [
        row({
          level: 'ERROR',
          trace_id: ROOT,
          '@message': '410 Gone from GET http://storage.example:8080/safe-storage/v1/files/PN_F24_META-example.json',
        }),
      ],
    });
    assert.strictEqual(result.detections[0]?.knownCase.id, 'f24-metadata-gone');
    assert.strictEqual(draft?.proposedStatus, 'IN_PROGRESS');
  });

  it('follows an F24 failure instead of an earlier INFO invocation of Data Vault', async () => {
    for (const level of ['ERROR', 'WARN']) {
      const { result, calls } = await execute(access(), [], {
        '/aws/ecs/pn-delivery': [
          row({
            level: 'INFO',
            trace_id: ROOT,
            '@timestamp': '2026-10-15T14:05:18Z',
            '@message':
              'Invoking external service http://internal.example:8080/datavault-private/v1/recipients/internal',
          }),
          row({
            level,
            trace_id: ROOT,
            '@timestamp': '2026-10-15T14:05:19Z',
            '@message': 'Request to GET http://internal.example:8080/f24-private/pdf/EXAMPLE failed',
          }),
        ],
        '/aws/ecs/pn-f24': [
          row({
            level: 'WARN',
            trace_id: ROOT,
            '@message': '410 Gone from GET http://storage.example:8080/safe-storage/v1/files/PN_F24_META-example.json',
          }),
        ],
      });
      // The F24 error is followed; the earlier INFO invocation of Data Vault is a route of the request, without errors.
      assert.deepStrictEqual(
        calls.map(({ groups }) => groups[0] ?? '').filter((group) => group.startsWith('/aws/ecs/')),
        ['/aws/ecs/pn-delivery', '/aws/ecs/pn-data-vault-sep', '/aws/ecs/pn-f24', '/aws/ecs/pn-safe-storage'],
      );
      assert.strictEqual(treeNodeVars(result, 'pn-delivery').get('deliveryNextUrlTarget'), 'pn-f24');
      assert.strictEqual(result.detections[0]?.knownCase.id, 'f24-metadata-gone');
    }
  });
});
