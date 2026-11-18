import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { executeAlarmWithLogs, isCidTrackerQuery } from '../../../shared/__tests__/helpers/runbookExecution.js';
import type { LogRows } from '../../../../../__tests__/helpers/LogRows.js';
import type { RunbookLogsExecution } from '../../../../../__tests__/helpers/RunbookLogsExecution.js';
import { AUTH_SERVER_5XX_ALARM as alarm } from '../alarmDefinition.js';
import { AUDIT_FALLBACK_CONFIRMED_VAR, AUDIT_FALLBACK_SEQUENCE_CONFIRMED_VAR } from '../AnalyzeAuditFallbackStep.js';
import { buildRunbook } from '../runbook.js';

const SUCCEEDED = 'auth-server-audit-fallback-succeeded';
const UNVERIFIED = 'auth-server-audit-fallback-unverified';
const FALLBACK =
  'Main auditing flow failed, going through fallback. Error: Timeout while acquiring lock (4 waiting locks): "connect to broker b-3.interopplatformevents.gfkljw.c4.kafka.eu-south-1.amazonaws.com:9098"';
const STANDALONE_KAFKA_TIMEOUT =
  'ERROR - Timeout while acquiring lock (4 waiting locks): "connect to broker b-1.interopplatformevents.gfkljw.c4.kafka.eu-south-1.amazonaws.com:9098"';
const WAF_FAILED = 'wafError: Failed to call WAF';
const SUCCESS = [
  FALLBACK,
  'Storing file token-details/20260626/a.ndjson in bucket interop-generated-jwt-details-fallback-prod-es1',
  'Auditing succeeded through fallback',
  'Token generated',
];

function row(message: string, cid?: string): LogRows[number] {
  return [
    { field: 'pod_app', value: alarm.serviceName },
    { field: 'log', value: message },
    ...(cid === undefined ? [] : [{ field: 'cid', value: cid }]),
  ];
}

interface Scenario {
  readonly environment?: string;
  readonly integrationError?: string;
  readonly application?: LogRows;
  /** Auth-server messages traced for each CID. */
  readonly traces?: Readonly<Record<string, ReadonlyArray<string>>>;
}

async function execute(scenario: Scenario): Promise<RunbookLogsExecution> {
  return executeAlarmWithLogs(
    buildRunbook(),
    `interop-auth-server-${scenario.environment ?? 'prod'}-apigw-5xx`,
    (query, logGroups) => {
      if (logGroups[0]?.startsWith('amazon-apigateway') === true) {
        return [
          [
            { field: 'count', value: '1' },
            { field: 'status', value: '504' },
            { field: 'integrationError', value: scenario.integrationError ?? '' },
          ],
        ];
      }
      if (!isCidTrackerQuery(query)) return scenario.application ?? [];
      const cid = /filter cid = "([^"]+)"/u.exec(query)?.[1] ?? '';
      return (scenario.traces?.[cid] ?? []).map((message) => row(message));
    },
  );
}

function sequenceConfirmed({ result }: RunbookLogsExecution): string | undefined {
  return result.finalContext.vars.get(AUDIT_FALLBACK_SEQUENCE_CONFIRMED_VAR);
}

describe('INTEROP auth-server 5xx runbook', () => {
  it('recognizes every documented signature from its own evidence source', async () => {
    for (const [id, message, source] of [
      ['auth-server-api-gateway-timeout', 'Execution failed due to a timeout error', 'API_GATEWAY'],
      ['auth-server-waf-timeout', 'WAF call got timed out', 'APPLICATION'],
      ['auth-server-kafka-lock-timeout', STANDALONE_KAFKA_TIMEOUT, 'APPLICATION'],
      [UNVERIFIED, FALLBACK, 'APPLICATION'],
      [
        'auth-server-invalid-client-assertion-header',
        'Invalid claims in client assertion header: [{"code":"unrecognized_keys","keys":["x5c","use"],"path":[],"message":"Unrecognized keys"}]',
        'APPLICATION',
      ],
      [
        'auth-server-invalid-identity-token',
        "ERROR - InvalidIdentityTokenException: Couldn't retrieve verification key from your identity provider, please reference AssumeRoleWithWebIdentity documentation for requirements",
        'APPLICATION',
      ],
      ['auth-server-waf-call-failed', WAF_FAILED, 'APPLICATION'],
      [
        'auth-server-stream-not-readable',
        'title: Unexpected error - detail: Unexpected error - errors: 007-9991, Unexpected error - original error: Error: Unexpected error',
        'APPLICATION',
      ],
      ['auth-server-stream-not-readable', 'Error in request: stream is not readable', 'APPLICATION'],
      [
        'auth-server-endpoint-connection-reset',
        'Execution failed due to a network error communicating with endpoint: Connection reset by peer',
        'API_GATEWAY',
      ],
    ] as const) {
      const scenario =
        source === 'API_GATEWAY'
          ? { integrationError: message }
          : { application: [row(message, 'cid-1')], traces: { 'cid-1': [message] } };
      assert.strictEqual((await execute(scenario)).matchedIds[0], id, message);
    }
  });

  it('does not attribute gateway-only signatures or an application timeout to the other source', async () => {
    for (const integrationError of [FALLBACK, STANDALONE_KAFKA_TIMEOUT, 'WAF call got timed out']) {
      assert.deepStrictEqual((await execute({ integrationError })).matchedIds, [], integrationError);
    }
    for (const message of ['an unknown application failure', 'Execution failed due to a timeout error']) {
      assert.deepStrictEqual((await execute({ application: [row(message)] })).matchedIds, [], message);
    }
  });

  it('scans the fallback marker besides the application errors and follows its CID', async () => {
    const { queries } = await execute({ application: [row(FALLBACK, 'cid-1')] });
    assert.match(queries[1]?.query ?? '', /@message like \/Main auditing flow failed, going through fallback\//u);
    assert.doesNotMatch(queries[1]?.query ?? '', /not like.*Invalid claims/u);
    assert.match(queries[2]?.query ?? '', /filter cid = "cid-1"/u);
  });

  it('confirms the documented fallback outcome for every CID', async () => {
    const execution = await execute({
      application: [row(FALLBACK, 'a'), row(FALLBACK, 'b')],
      traces: { a: SUCCESS, b: SUCCESS },
    });
    assert.deepStrictEqual(execution.matchedIds, [SUCCEEDED]);
    assert.strictEqual(sequenceConfirmed(execution), 'true');
  });

  it('keeps independent diagnoses alongside or ahead of a successful fallback', async () => {
    const invalidHeader =
      'Invalid claims in client assertion header: [{"code":"unrecognized_keys","keys":["x5c","use"]}]';
    const header = await execute({
      application: [row(FALLBACK, 'a'), row(invalidHeader, 'b')],
      traces: { a: SUCCESS },
    });
    assert.deepStrictEqual(header.matchedIds, [SUCCEEDED, 'auth-server-invalid-client-assertion-header']);

    const waf = await execute({ application: [row(FALLBACK, 'a'), row(WAF_FAILED, 'b')], traces: { a: SUCCESS } });
    assert.strictEqual(waf.matchedIds[0], 'auth-server-waf-call-failed');
  });

  it('confirms the fallback sequence only with the bucket of the resolved environment', async () => {
    for (const environment of ['prod', 'att', 'test']) {
      for (const bucket of ['prod', 'att', 'test', 'prod-es1-unrelated']) {
        const messages = SUCCESS.map((message) => message.replace('fallback-prod-es1', `fallback-${bucket}-es1`));
        const execution = await execute({ environment, application: [row(FALLBACK, 'a')], traces: { a: messages } });
        assert.strictEqual(sequenceConfirmed(execution), String(environment === bucket), `${environment}/${bucket}`);
        // Every documented case concerns production.
        assert.strictEqual(execution.matchedIds.length, environment === 'prod' ? 1 : 0);
      }
    }
  });

  it('leaves the fallback unverified with an incomplete, reordered or split sequence', async () => {
    for (const [name, application, traces] of [
      ['missing token', [row(FALLBACK, 'a')], { a: SUCCESS.slice(0, 3) }],
      ['missing S3 write', [row(FALLBACK, 'a')], { a: [FALLBACK, ...SUCCESS.slice(2)] }],
      ['missing audit success', [row(FALLBACK, 'a')], { a: [FALLBACK, SUCCESS[1] ?? '', 'Token generated'] }],
      ['success precedes failure', [row(FALLBACK, 'a')], { a: [...SUCCESS.slice(1), FALLBACK] }],
      ['another failure after success', [row(FALLBACK, 'a')], { a: [...SUCCESS, FALLBACK] }],
      [
        'evidence split across CIDs',
        [row(FALLBACK, 'a'), row(FALLBACK, 'b'), row(FALLBACK, 'unqueried')],
        { a: SUCCESS.slice(0, 2), b: SUCCESS.slice(2) },
      ],
    ] as const) {
      assert.deepStrictEqual((await execute({ application, traces })).matchedIds, [UNVERIFIED], name);
    }
  });

  it('does not hide a failure without CID behind a recovered request', async () => {
    const execution = await execute({ application: [row(FALLBACK), row(FALLBACK, 'a')], traces: { a: SUCCESS } });
    assert.strictEqual(execution.result.finalContext.vars.get(AUDIT_FALLBACK_CONFIRMED_VAR), 'false');
  });

  it('does not classify an error that belongs only to another service in the CID tracker', async () => {
    const { matchedIds } = await executeAlarmWithLogs(
      buildRunbook(),
      'interop-auth-server-prod-apigw-5xx',
      (query, logGroups) => {
        if (logGroups[0]?.startsWith('amazon-apigateway') === true) return [[{ field: 'count', value: '1' }]];
        return isCidTrackerQuery(query)
          ? [
              [
                { field: 'pod_app', value: 'interop-be-another-service' },
                { field: '@message', value: WAF_FAILED },
              ],
            ]
          : [row('Unknown error', 'a')];
      },
    );
    assert.deepStrictEqual(matchedIds, []);
  });
});
