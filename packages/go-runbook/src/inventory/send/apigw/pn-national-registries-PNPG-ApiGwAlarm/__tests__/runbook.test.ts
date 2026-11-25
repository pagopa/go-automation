import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import { GOLogger } from '@pagopa/go-common/logging';
import { createTestServiceRegistry } from '../../../../../toolkits/send/index.js';
import { executeRunbookForOccurrence } from '../../../../../runtime/index.js';
import { KNOWN_CASES } from '../knownCases.js';
import { API_GW_LOG_GROUP } from '../knownServices.js';
import { buildRunbook } from '../runbook.js';
import { createTestContext } from '../../../../../__tests__/helpers/createTestContext.js';
import { executeWithLogs } from '../../../../../__tests__/helpers/executeWithLogs.js';
import { caseMatches, knownCaseById } from '../../../../../__tests__/helpers/knownCaseMatching.js';
import { logRow } from '../../../../../__tests__/helpers/logRow.js';
import type { RunbookLogsExecution } from '../../../../../__tests__/helpers/RunbookLogsExecution.js';

type Rows = ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>;
const TRACE = '1-6ad1eae3-493a74b231f3e345492729e9';

const GATEWAY_504 = {
  status: '504',
  httpMethod: 'POST',
  path: '/national-registries-private/infocamere/legal-institutions',
  xrayTraceId: `Root=${TRACE}`,
};

async function execute(
  completion: Rows = [],
  errorMessage = 'Endpoint request timed out',
): Promise<RunbookLogsExecution> {
  const runbook = buildRunbook();
  return executeWithLogs(
    runbook,
    {
      alarmName: runbook.metadata.id,
      alarmDatetime: '2026-10-16T09:15:04Z',
      startTime: '2026-10-16T09:10:04Z',
      endTime: '2026-10-16T09:20:05Z',
    },
    (query, [group = '']) => {
      if (group === API_GW_LOG_GROUP) {
        return [logRow({ '@timestamp': '2026-10-16 09:14:11.382', ...GATEWAY_504, errorMessage })];
      }
      return query.includes('Checking [INFO CAMERE] legal institutions passed') ? completion : [];
    },
  );
}

describe('PNPG national registries diagnosis', () => {
  it('recognizes the observed 504 with later application completion without claiming caller recovery', async () => {
    const completion: Rows = [
      [
        { field: '@timestamp', value: '2026-10-16 09:14:43.923' },
        { field: 'level', value: 'INFO' },
        { field: 'message', value: 'Checking [INFO CAMERE] legal institutions passed' },
        { field: 'trace_id', value: TRACE },
      ],
    ];
    const { result, queries, draft } = await execute(completion);
    assert.strictEqual(result.status, 'completed');
    // Every case of the request is reported, the ones read from variables at the time of the request.
    assert.ok(
      result.detections.some(({ knownCase }) => knownCase.id === 'apigw-504-legal-institutions-completion-observed'),
    );
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
    assert.deepStrictEqual(draft.downstreams, []);

    const query = queries.find(({ query: text }) =>
      text.includes('Checking [INFO CAMERE] legal institutions passed'),
    )?.query;
    assert.ok(query?.includes(TRACE));
  });

  it('exports completion timestamps and trace alongside the 504 when the application error scan is empty', async () => {
    const completion = [
      { timestamp: '2026-10-16T09:13:40Z', message: 'Starting process _infoCamereLegalInstitutions' },
      { timestamp: '2026-10-16T09:14:43Z', message: 'Checking [INFO CAMERE] legal institutions passed' },
      { timestamp: '2026-10-16T09:14:44Z', message: 'Ending process _infoCamereLegalInstitutions' },
    ];
    const queries: string[] = [];
    const output = await executeRunbookForOccurrence(
      {
        logger: new GOLogger(),
        services: createTestServiceRegistry({
          cloudWatchLogs: {
            // eslint-disable-next-line @typescript-eslint/require-await
            async queryWithStatistics(groups: ReadonlyArray<string>, query: string) {
              queries.push(query);
              const resultRows: Rows =
                groups[0] === API_GW_LOG_GROUP
                  ? [
                      [
                        { field: '@timestamp', value: '2026-10-16T09:14:11Z' },
                        { field: 'xrayTraceId', value: `Root=${TRACE}` },
                        { field: 'status', value: '504' },
                        { field: 'httpMethod', value: 'POST' },
                        { field: 'path', value: '/national-registries-private/infocamere/legal-institutions' },
                        { field: 'errorMessage', value: 'Endpoint request timed out' },
                        { field: '@message', value: JSON.stringify({ status: 504, xrayTraceId: `Root=${TRACE}` }) },
                      ],
                    ]
                  : query.includes('Checking [INFO CAMERE] legal institutions passed')
                    ? completion.map(({ timestamp, message }) => [
                        { field: '@timestamp', value: timestamp },
                        { field: 'level', value: 'INFO' },
                        { field: 'message', value: message },
                        { field: 'trace_id', value: TRACE },
                      ])
                    : [];
              return {
                rows: resultRows,
                statistics: { bytesScanned: 1, recordsMatched: resultRows.length, recordsScanned: resultRows.length },
                queryExecutions: [],
              };
            },
          },
        }),
      },
      {
        alarmName: 'pn-national-registries-PNPG-ApiGwAlarm',
        firedAt: '2026-10-16T09:15:04Z',
        awsAccountId: '111111111111',
        region: 'eu-south-1',
        awsProfiles: [],
        executionMode: 'cloud',
      },
    );
    const serialized = JSON.parse(JSON.stringify(output)) as typeof output;
    const evidence = serialized.context.evidence.find(
      ({ sourceStep }) => sourceStep === 'query-national-registries-completion',
    );
    assert.ok(evidence, 'missing application completion evidence in the occurrence result');
    assert.strictEqual(evidence.type, 'log-sample');
    assert.strictEqual(evidence.truncated, false);
    assert.deepStrictEqual(
      evidence.items?.map(({ timestamp, message, trace_id: traceId }) => ({ timestamp, message, trace_id: traceId })),
      completion.map(({ timestamp, message }) => ({ timestamp, message, trace_id: TRACE })),
    );
    const gateway = serialized.context.evidence.find(({ sourceStep }) => sourceStep === 'query-api-gw-logs');
    assert.strictEqual(gateway?.items?.[0]?.['timestamp'], '2026-10-16T09:14:11Z');
    assert.ok(gateway?.items?.[0]?.['message']?.includes('504'));
    assert.ok(queries.some((query) => query.includes("level == 'ERROR'")));
    assert.ok(!serialized.context.evidence.some(({ sourceStep }) => sourceStep === 'query-pn-national-registries'));
    assert.strictEqual(serialized.outcome.kind, 'known-case-matched');
    assert.ok(
      serialized.outcome.detections.some(({ caseId }) => caseId === 'apigw-504-legal-institutions-completion-observed'),
    );
    assert.strictEqual(serialized.analysis?.kind, 'KNOWN_CASE');
    assert.strictEqual(serialized.analysis.proposedStatus, 'IN_PROGRESS');
  });

  it('keeps a 504 with no application evidence open without assigning INAD or InfoCamere as cause', async () => {
    const { result, draft } = await execute();
    assert.ok(result.detections.some(({ knownCase }) => knownCase.id === 'apigw-504-infocamere-inad-timeout'));
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
    assert.deepStrictEqual(draft.downstreams, []);
  });

  it('keeps the generic gateway timeout open instead of declaring a transient recovered error', async () => {
    const { result, draft } = await execute([], 'Execution failed due to a timeout error');
    assert.deepStrictEqual(
      result.detections.map(({ knownCase }) => knownCase.id),
      ['apigw-504-timeout'],
    );
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
  });

  it('matches the documented connection timeouts only for their actual host and service', () => {
    for (const [id, service, host] of [
      ['downstream-inad-connect-timeout', 'INAD', 'api.inad.gov.it'],
      ['downstream-ade-connect-timeout', 'AdE', 'gatewaywebservices.agenziaentrate.it'],
    ]) {
      for (const [target, expected] of [
        [`${host}/192.0.2.1:443`, true],
        ['unrelated.example', false],
      ] as const) {
        const context = createTestContext({
          stepResults: {
            'query-pn-national-registries': [
              `[DOWNSTREAM] Service ${service} returned errors=connection timed out after 3000 ms: ${target}`,
            ],
          },
        });
        assert.strictEqual(caseMatches(knownCaseById(KNOWN_CASES, id ?? ''), context), expected, `${id}: ${target}`);
      }
    }
  });
});
