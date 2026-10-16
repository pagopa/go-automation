import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AWSCloudWatchLogsQueryResult, ResultField } from '@go-automation/go-common/aws';
import { GOLogger } from '@go-automation/go-common/core';
import type { RunbookExecutionResult } from '../../../../types/RunbookExecutionResult.js';
import type { KnownCaseAnalysisDraft } from '../../../../output/KnownCaseAnalysisDraft.js';
import { RunbookEngine } from '../../../../core/RunbookEngine.js';
import { buildAnalysisDraft } from '../../../../output/buildAnalysisDraft.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { assertCloudExecutableRunbook } from '../../../../validation/assertCloudExecutableRunbook.js';
import { ConditionEvaluator, type RunbookContext } from '../../framework.js';
import { RUNBOOK_CATALOG } from '../../../RunbookCatalog.js';
import { buildRunbook } from '../runbook.js';
import { KNOWN_CASES } from '../knownCases.js';
import { API_GW_LOG_GROUP } from '../knownServices.js';

const ROOT = '1-6ad0dd73-32533ff75fc4602939265354';
const REQUEST = '42e21ca4-bb03-4597-9af8-e80691ca0d80';
const FALLBACK = '11111111-1111-1111-1111-111111111111';
const EXECUTION_GROUP = 'API-Gateway-Execution-Logs_64pohg7bg0/unique';
const row = (values: Record<string, string>): ReadonlyArray<ResultField> =>
  Object.entries(values).map(([field, value]) => ({ field, value }));
const access = (values: Record<string, string> = {}): ReadonlyArray<ResultField> =>
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
  accessRow: ReadonlyArray<ResultField>,
  executionMessages: ReadonlyArray<string> | Error = [],
  application: Record<string, ReadonlyArray<ReadonlyArray<ResultField>>> = {},
): Promise<{
  result: RunbookExecutionResult;
  draft: KnownCaseAnalysisDraft;
  calls: { group: string; query: string }[];
}> {
  const calls: { group: string; query: string }[] = [];
  const cloudWatchLogs = {
    async queryWithStatistics(groups: ReadonlyArray<string>, query: string): Promise<AWSCloudWatchLogsQueryResult> {
      await Promise.resolve();
      const group = groups[0] ?? '';
      calls.push({ group, query });
      let rows: ReadonlyArray<ReadonlyArray<ResultField>>;
      if (group === API_GW_LOG_GROUP) rows = [accessRow];
      else if (group === EXECUTION_GROUP) {
        if (executionMessages instanceof Error) throw executionMessages;
        rows = executionMessages.map((message) => row({ '@message': `(${REQUEST}) ${message}` }));
      } else rows = application[group] ?? [];
      return {
        rows,
        statistics: { recordsScanned: rows.length, recordsMatched: rows.length, bytesScanned: 1 },
        queryExecutions: [],
      };
    },
  };
  const runbook = buildRunbook();
  const result = await new RunbookEngine(new GOLogger()).execute(
    runbook,
    new Map([
      ['startTime', '2026-10-15T14:00:18Z'],
      ['endTime', '2026-10-15T14:10:19Z'],
    ]),
    createTestServiceRegistry({ cloudWatchLogs }),
  );
  assert.strictEqual(result.status, 'completed');
  const draft = buildAnalysisDraft(runbook, result);
  assert.strictEqual(draft?.kind, 'KNOWN_CASE');
  return { result, draft, calls };
}

function matches(id: string, stepId: string, message: string): boolean {
  const candidate = KNOWN_CASES.find((c) => c.id === id);
  assert.ok(candidate);
  const ctx: RunbookContext = {
    executionId: 'test',
    startedAt: new Date(),
    params: new Map(),
    vars: new Map(),
    stepResults: new Map([[stepId, [row({ '@message': message })]]]),
    services: createTestServiceRegistry(),
    logs: [],
    recoveredErrors: [],
  };
  return new ConditionEvaluator().evaluate(candidate.condition, ctx);
}

describe('IO_EXP diagnosis', () => {
  it('keeps the registered runbook read-only, links Confluence and requires follow-up for all known cases', () => {
    const entry = RUNBOOK_CATALOG.resolveByAlarmName('pn-delivery-IO_EXP-ApiGwAlarm');
    assert.ok(entry);
    assert.doesNotThrow(() => assertCloudExecutableRunbook(entry.build()));
    assert.ok(KNOWN_CASES.every((c) => c.analysis?.proposedStatus === 'IN_PROGRESS'));
    assert.ok(buildRunbook().analysisDefaults?.links?.some((l) => l.url.includes('/2912321697/')));
    const legacy = KNOWN_CASES.find((c) => c.id === 'execution-failed-configuration-error');
    assert.strictEqual(legacy?.action.type, 'log');
    assert.strictEqual(legacy.action.title, '[EXECUTION LOG] Execution failed due to configuration error');
  });

  it('reads execution logs before distinguishing invocation 504 from a Lambda handler timeout', async () => {
    const { result, draft, calls } = await execute(
      access({ authorizerStatus: '500', authorizerLatency: '10000', authorizerRequestId: '-' }),
      [
        'Lambda invocation failed with status: 504. Lambda request id: N/A',
        'Execution failed due to configuration error: Authorizer error',
        'Gateway response type: AUTHORIZER_CONFIGURATION_ERROR with status code: 500',
      ],
    );
    assert.strictEqual(result.matchedCases[0]?.id, 'authorizer-invocation-504');
    assert.deepStrictEqual(
      calls.map((c) => c.group),
      [API_GW_LOG_GROUP, EXECUTION_GROUP],
    );
    assert.strictEqual(draft?.proposedStatus, 'IN_PROGRESS');
    assert.match(draft.conclusionNotes, /non prova un timeout del codice Lambda/);
  });

  it('distinguishes integration signature failure after successful authorization from generic configuration errors', async () => {
    const { result, draft } = await execute(access({ httpMethod: 'POST', integrationServiceStatus: '403' }), [
      'Successfully completed authorizer execution',
      'Lambda invocation failed with status: 403. Lambda request id: integration-request',
      'Execution failed due to configuration error: The request signature we calculated does not match the signature you provided. Check your AWS Secret Access Key and signing method.',
    ]);
    assert.strictEqual(result.matchedCases[0]?.id, 'integration-signature-mismatch');
    assert.strictEqual(draft?.proposedStatus, 'IN_PROGRESS');
  });

  it('retains an unresolved authorizer diagnosis when execution logs cannot be read', async () => {
    const { result, draft, calls } = await execute(
      access({ authorizerStatus: '500', authorizerLatency: '10000' }),
      new Error('AccessDeniedException'),
    );
    assert.strictEqual(result.matchedCases[0]?.id, 'authorizer-access-log-failure');
    assert.strictEqual(result.finalContext.vars.get('apiGwExecutionLogMode'), 'unavailable');
    assert.strictEqual(draft?.proposedStatus, 'IN_PROGRESS');
    assert.ok(!calls.some((c) => c.group === '/aws/ecs/pn-delivery'));
  });

  it('does not assume that an integration 502 proves Delivery unavailability', async () => {
    const { result, draft, calls } = await execute(access({ integrationServiceStatus: '502' }));
    assert.ok(calls.some((c) => c.group === EXECUTION_GROUP));
    assert.strictEqual(result.matchedCases[0]?.id, 'integration-502');
    assert.strictEqual(draft?.proposedStatus, 'IN_PROGRESS');
    assert.match(draft.conclusionNotes, /non prova che pn-delivery fosse indisponibile/);
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
          '@message':
            'WebClientResponseException$InternalServerError: 500 Internal Server Error from GET https://api.pdv.pagopa.it/user-registry/v1/users/<userId>',
        }),
      ],
    });
    assert.strictEqual(result.matchedCases[0]?.id, 'downstream-pdv-500-internal-server-error');
    const query = calls.find((c) => c.group === '/aws/ecs/pn-data-vault-sep')?.query ?? '';
    assert.ok(query.includes(ROOT));
    assert.ok(!query.includes(FALLBACK));
    assert.ok(query.includes("level = 'WARN'"));
    assert.strictEqual(result.finalContext.vars.get('deliveryFallbackUuid'), FALLBACK);
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
    assert.strictEqual(result.matchedCases[0]?.id, 'f24-metadata-gone');
    assert.strictEqual(draft?.proposedStatus, 'IN_PROGRESS');
  });
});
