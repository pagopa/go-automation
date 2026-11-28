import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { interop } from '../../../../../toolkits/interop/index.js';
import { cidTrackerOutput, conditionContext, podLogRows } from '../../../shared/__tests__/helpers/knownErrorTesting.js';
import type { LogRows } from '../../../../../__tests__/helpers/LogRows.js';
import { createTestReads } from '../../../../../__tests__/helpers/createTestReads.js';
import {
  AnalyzeAuditFallbackStep,
  AUDIT_FALLBACK_CONFIRMED_VAR,
  AUDIT_FALLBACK_PATTERN,
  AUDIT_FALLBACK_SEQUENCE_CONFIRMED_VAR,
} from '../AnalyzeAuditFallbackStep.js';
import { AUTH_SERVER_5XX_ALARM as alarm } from '../alarmDefinition.js';

const SUCCESS = [
  AUDIT_FALLBACK_PATTERN,
  'Storing file token-details/20260911/a.ndjson in bucket interop-generated-jwt-details-fallback-prod-es1',
  'Auditing succeeded through fallback',
  'Token generated',
];
/** One API Gateway 5xx without integration error. */
const ONE_GATEWAY_ERROR: LogRows = [
  [
    { field: 'count', value: '1' },
    { field: 'integrationError', value: ' - ' },
  ],
];
/** Application row of the fallback failure for CID `a`. */
const FALLBACK_ROW: LogRows[number] = [
  { field: 'cid', value: 'a' },
  { field: '@message', value: `[CID=a] ${AUDIT_FALLBACK_PATTERN}` },
];

interface Evidence {
  readonly application?: LogRows;
  readonly tracker?: unknown;
  readonly gateway?: LogRows;
  readonly environment?: string;
}

const STEP = new AnalyzeAuditFallbackStep();

/** Runs the step on the given evidence; by default one gateway error and the whole sequence for CID `a`. */
async function analyze(evidence: Evidence = {}): ReturnType<typeof STEP.execute> {
  return STEP.execute(
    conditionContext(
      [
        [alarm.stepIds.queryApiGwAggregates, evidence.gateway ?? ONE_GATEWAY_ERROR],
        [alarm.stepIds.queryApplicationLogs, evidence.application ?? [FALLBACK_ROW]],
        [
          alarm.stepIds.queryCidTracker,
          evidence.tracker ?? cidTrackerOutput(podLogRows(alarm.serviceName, SUCCESS), 'a'),
        ],
      ],
      evidence.environment,
    ),
  );
}

function withExtraRow(row: LogRows[number]): unknown {
  return cidTrackerOutput([...podLogRows(alarm.serviceName, SUCCESS), row], 'a');
}

describe('AnalyzeAuditFallbackStep', () => {
  it('leaves the sequence unknown, never false, when a read it depends on is incomplete', async () => {
    for (const stepId of [
      alarm.stepIds.queryApplicationLogs,
      alarm.stepIds.queryCidTracker,
      alarm.stepIds.queryApiGwAggregates,
    ]) {
      const context = conditionContext([
        [alarm.stepIds.queryApiGwAggregates, ONE_GATEWAY_ERROR],
        [alarm.stepIds.queryApplicationLogs, []],
        [alarm.stepIds.queryCidTracker, []],
      ]);
      const reads = createTestReads([{ stepId, complete: false, reason: 'saturated' }]);
      const result = await STEP.execute({ ...context, reads });
      assert.strictEqual(result.vars?.[AUDIT_FALLBACK_SEQUENCE_CONFIRMED_VAR], 'unknown', stepId);
    }
  });

  it('rejects missing or unsupported environments instead of assuming production', async () => {
    for (const environment of ['', 'dev']) {
      const result = await analyze({ environment });
      assert.strictEqual(result.success, false);
      assert.match(result.error ?? '', /Ambiente INTEROP/u);
    }
  });

  it('fails explicitly when required evidence is missing', async () => {
    const result = await STEP.execute(conditionContext([[alarm.stepIds.queryApiGwAggregates, ONE_GATEWAY_ERROR]]));
    assert.strictEqual(result.success, false);
  });

  it('does not confirm malformed or empty tracker evidence', async () => {
    const result = await analyze({
      application: [],
      tracker: [null, {}, { cid: 'a', rows: 'invalid' }, { cid: '', rows: [] }],
    });
    assert.strictEqual(result.vars?.[AUDIT_FALLBACK_CONFIRMED_VAR], 'false');
  });

  it('reads JSON-encoded logs and ignores success markers from another service', async () => {
    for (const podApp of [alarm.serviceName, 'another-service']) {
      const tracker = cidTrackerOutput(
        podLogRows(
          podApp,
          SUCCESS.map((message) => JSON.stringify({ log: message })),
        ),
        'a',
      );
      const result = await analyze({ tracker });
      assert.strictEqual(result.vars?.[AUDIT_FALLBACK_CONFIRMED_VAR], String(podApp === alarm.serviceName));
    }
  });

  it('accepts only the correlated fallback-writer markers between auth-server boundaries', async () => {
    const writer = 'interop-be-fallback-writer';
    const tracker = cidTrackerOutput(
      [
        ...podLogRows(alarm.serviceName, [AUDIT_FALLBACK_PATTERN]),
        ...podLogRows(writer, [SUCCESS[1] ?? '', SUCCESS[2] ?? '', 'Fallback writer request completed']),
        ...podLogRows(alarm.serviceName, ['Token generated']),
        [
          { field: 'pod_app', value: alarm.serviceName },
          { field: 'stream', value: 'stdout' },
          { field: '@message', value: 'Authorization request completed' },
        ],
      ],
      'a',
    );
    const result = await analyze({ tracker });
    assert.strictEqual(result.vars?.[AUDIT_FALLBACK_CONFIRMED_VAR], 'true');
    assert.deepStrictEqual(result.output?.confirmedCids, ['a']);
  });

  it('orders the sequence by application timestamps, not by collection timestamps', async () => {
    const application: LogRows = [
      [
        { field: 'cid', value: 'a' },
        { field: 'log', value: AUDIT_FALLBACK_PATTERN },
      ],
    ];
    const tracker = (logs: ReadonlyArray<string>): unknown =>
      cidTrackerOutput(
        logs.map((log) => [
          { field: '@timestamp', value: '2026-10-25 18:52:52.894' },
          { field: 'pod_app', value: alarm.serviceName },
          { field: '@message', value: JSON.stringify({ log }) },
        ]),
        'a',
      );
    const reordered = await analyze({
      application,
      tracker: tracker([
        '2026-10-25T18:52:52.805Z INFO - Token generated',
        '2026-10-25T18:52:52.805Z INFO - Auditing succeeded through fallback',
        '2026-10-25T18:52:52.730Z WARN - Main auditing flow failed, going through fallback',
        '2026-10-25T18:52:52.730Z INFO - Storing file token-details/a.ndjson in bucket interop-generated-jwt-details-fallback-prod-es1',
      ]),
    });
    assert.strictEqual(reordered.vars?.[AUDIT_FALLBACK_SEQUENCE_CONFIRMED_VAR], 'true');

    const failureAfterToken = await analyze({
      application,
      tracker: tracker([
        `2026-10-26T20:45:01.000Z ${AUDIT_FALLBACK_PATTERN}`,
        `2026-10-26T20:45:00.000Z ${AUDIT_FALLBACK_PATTERN}`,
        `2026-10-26T20:45:00.001Z ${SUCCESS[1] ?? ''}`,
        '2026-10-26T20:45:00.002Z Auditing succeeded through fallback',
        '2026-10-26T20:45:00.002Z Token generated',
      ]),
    });
    assert.strictEqual(failureAfterToken.vars?.[AUDIT_FALLBACK_SEQUENCE_CONFIRMED_VAR], 'false');
  });

  it('does not turn one quoted summary of the whole flow into four independent markers', async () => {
    const result = await analyze({
      tracker: cidTrackerOutput(podLogRows(alarm.serviceName, [SUCCESS.join(' ')]), 'a'),
    });
    assert.strictEqual(result.vars?.[AUDIT_FALLBACK_SEQUENCE_CONFIRMED_VAR], 'false');
  });

  it('confirms the sequence but blocks completion when a traced service emits an unclassified error', async () => {
    for (const [podApp, stream, message] of [
      ['interop-be-fallback-writer', 'stdout', 'ERROR unclassified writer failure'],
      ['interop-be-fallback-writer', 'stderr', 'Unclassified writer failure'],
      [alarm.serviceName, 'stdout', 'ERROR unrelated authorization failure'],
      [alarm.serviceName, 'stderr', 'Unrelated authorization failure'],
      [alarm.serviceName, 'stdout', JSON.stringify({ level: 'ERROR', log: 'Unrelated authorization failure' })],
    ] as const) {
      const result = await analyze({
        tracker: withExtraRow([
          { field: 'pod_app', value: podApp },
          { field: 'stream', value: stream },
          { field: '@message', value: message },
        ]),
      });
      assert.strictEqual(result.vars?.[AUDIT_FALLBACK_SEQUENCE_CONFIRMED_VAR], 'true', message);
      assert.strictEqual(result.vars?.[AUDIT_FALLBACK_CONFIRMED_VAR], 'false', message);
      assert.strictEqual(result.output?.additionalTrackerErrors, 1);
    }
  });

  it('confirms the sequence but refuses completion when another application error remains', async () => {
    const result = await analyze({
      application: [
        FALLBACK_ROW,
        [
          { field: 'cid', value: 'b' },
          { field: '@message', value: '[CID=b] ERROR unclassified authorization failure' },
        ],
      ],
    });
    assert.strictEqual(result.vars?.[AUDIT_FALLBACK_SEQUENCE_CONFIRMED_VAR], 'true');
    assert.strictEqual(result.vars?.[AUDIT_FALLBACK_CONFIRMED_VAR], 'false');
  });

  it('compares the gateway errors with the fallback CIDs without counting retried requests twice', async () => {
    const independent = await analyze({
      gateway: [
        ...ONE_GATEWAY_ERROR,
        [
          { field: 'count', value: '1' },
          { field: 'integrationError', value: 'Unexpected gateway transport failure' },
        ],
      ],
    });
    assert.strictEqual(independent.vars?.[AUDIT_FALLBACK_CONFIRMED_VAR], 'false');

    const retried = await analyze({
      gateway: [
        [
          { field: 'count', value: '2' },
          { field: 'integrationError', value: ' - ' },
        ],
      ],
    });
    assert.strictEqual(retried.vars?.[AUDIT_FALLBACK_CONFIRMED_VAR], 'true');

    const missing = await analyze({ gateway: [] });
    assert.strictEqual(missing.vars?.[AUDIT_FALLBACK_SEQUENCE_CONFIRMED_VAR], 'true');
    assert.strictEqual(missing.vars?.[AUDIT_FALLBACK_CONFIRMED_VAR], 'false');
  });

  it('fails closed when the application evidence reaches the query row limit', async () => {
    const application = Array.from(
      { length: interop.apigw.INTEROP_API_GW_APPLICATION_QUERY_LIMIT },
      () => FALLBACK_ROW,
    );
    const context = conditionContext([
      [alarm.stepIds.queryApiGwAggregates, ONE_GATEWAY_ERROR],
      [alarm.stepIds.queryApplicationLogs, application],
      [alarm.stepIds.queryCidTracker, cidTrackerOutput(podLogRows(alarm.serviceName, SUCCESS), 'a')],
    ]);
    // The query step declares a read at its row limit saturated.
    const reads = createTestReads([
      { stepId: alarm.stepIds.queryApplicationLogs, complete: false, reason: 'saturated' },
    ]);
    const result = await STEP.execute({ ...context, reads });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.vars?.[AUDIT_FALLBACK_CONFIRMED_VAR], 'false');
    assert.deepStrictEqual(result.output, {
      confirmedCids: ['a'],
      unresolvedCids: [],
      uncorrelatedErrors: 0,
      additionalApplicationErrors: 0,
      additionalTrackerErrors: 0,
      applicationEvidenceComplete: false,
      apiGatewayErrorCount: 1,
      apiGatewayIntegrationErrorCount: 0,
      apiGatewayCountsValid: true,
      apiGatewayEvidenceComplete: true,
    });
  });
});
