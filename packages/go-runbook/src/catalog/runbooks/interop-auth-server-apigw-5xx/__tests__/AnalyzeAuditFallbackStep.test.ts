import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RunbookContext } from '../../../../types/RunbookContext.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import {
  AnalyzeAuditFallbackStep,
  AUDIT_FALLBACK_CONFIRMED_VAR,
  AUDIT_FALLBACK_PATTERN,
  AUDIT_FALLBACK_SEQUENCE_CONFIRMED_VAR,
} from '../AnalyzeAuditFallbackStep.js';
import { AUTH_SERVER_5XX_ALARM as alarm } from '../alarmDefinition.js';
import { INTEROP_API_GW_APPLICATION_QUERY_LIMIT } from '../../../../interop/apigw/queries/interopApiGwApplicationQueries.js';

const SUCCESS = [
  AUDIT_FALLBACK_PATTERN,
  'Storing file token-details/20260911/a.ndjson in bucket interop-generated-jwt-details-fallback-prod-es1',
  'Auditing succeeded through fallback',
  'Token generated',
];

function context(): RunbookContext & { stepResults: Map<string, unknown> } {
  return {
    executionId: 'audit-test',
    startedAt: new Date(),
    stepResults: new Map(),
    vars: new Map([['interopEnvironment', 'prod']]),
    params: new Map(),
    logs: [],
    recoveredErrors: [],
    services: createTestServiceRegistry(),
  };
}

describe('AnalyzeAuditFallbackStep', () => {
  it('rejects missing or unsupported environments instead of assuming production', async () => {
    for (const vars of [new Map<string, string>(), new Map([['interopEnvironment', 'dev']])]) {
      const result = await new AnalyzeAuditFallbackStep().execute({ ...context(), vars });
      assert.strictEqual(result.success, false);
      assert.match(result.error ?? '', /Ambiente INTEROP/);
    }
  });

  it('fails explicitly when required evidence is missing', async () => {
    const result = await new AnalyzeAuditFallbackStep().execute(context());
    assert.strictEqual(result.success, false);
  });

  it('does not confirm malformed or empty tracker evidence', async () => {
    const ctx = context();
    ctx.stepResults.set(alarm.stepIds.queryApplicationLogs, []);
    ctx.stepResults.set(alarm.stepIds.queryCidTracker, [
      null,
      {},
      { cid: 'a', rows: 'invalid' },
      { cid: '', rows: [] },
    ]);
    const result = await new AnalyzeAuditFallbackStep().execute(ctx);
    assert.strictEqual(result.vars?.[AUDIT_FALLBACK_CONFIRMED_VAR], 'false');
  });

  it('reads JSON-encoded logs and ignores success markers from another service', async () => {
    for (const podApp of [alarm.serviceName, 'another-service']) {
      const ctx = context();
      ctx.stepResults.set(alarm.stepIds.queryApplicationLogs, [
        [{ field: '@message', value: `[CID=a] ${AUDIT_FALLBACK_PATTERN}` }],
      ]);
      ctx.stepResults.set(alarm.stepIds.queryCidTracker, [
        {
          cid: 'a',
          rows: SUCCESS.map((message) => [
            { field: 'pod_app', value: podApp },
            { field: '@message', value: JSON.stringify({ log: message }) },
          ]),
        },
      ]);
      const result = await new AnalyzeAuditFallbackStep().execute(ctx);
      assert.strictEqual(result.vars?.[AUDIT_FALLBACK_CONFIRMED_VAR], String(podApp === alarm.serviceName));
    }
  });

  it('accepts only the correlated fallback-writer markers between auth-server boundaries', async () => {
    const ctx = context();
    ctx.stepResults.set(alarm.stepIds.queryApplicationLogs, [
      [{ field: '@message', value: `[CID=a] ${AUDIT_FALLBACK_PATTERN}` }],
    ]);
    ctx.stepResults.set(alarm.stepIds.queryCidTracker, [
      {
        cid: 'a',
        rows: [
          [
            { field: 'pod_app', value: alarm.serviceName },
            { field: '@message', value: AUDIT_FALLBACK_PATTERN },
          ],
          [
            { field: 'pod_app', value: 'interop-be-fallback-writer' },
            { field: '@message', value: SUCCESS[1] ?? '' },
          ],
          [
            { field: 'pod_app', value: 'interop-be-fallback-writer' },
            { field: '@message', value: SUCCESS[2] ?? '' },
          ],
          [
            { field: 'pod_app', value: alarm.serviceName },
            { field: '@message', value: 'Token generated' },
          ],
        ],
      },
    ]);

    const result = await new AnalyzeAuditFallbackStep().execute(ctx);

    assert.strictEqual(result.vars?.[AUDIT_FALLBACK_CONFIRMED_VAR], 'true');
    assert.deepStrictEqual(result.output?.confirmedCids, ['a']);
  });

  it('confirms the CID sequence but refuses alarm completion when another application error remains', async () => {
    const ctx = context();
    ctx.stepResults.set(alarm.stepIds.queryApplicationLogs, [
      [
        { field: 'cid', value: 'a' },
        { field: '@message', value: `[CID=a] ${AUDIT_FALLBACK_PATTERN}` },
      ],
      [
        { field: 'cid', value: 'b' },
        { field: '@message', value: '[CID=b] ERROR unclassified authorization failure' },
      ],
    ]);
    ctx.stepResults.set(alarm.stepIds.queryCidTracker, [
      {
        cid: 'a',
        rows: SUCCESS.map((message) => [
          { field: 'pod_app', value: alarm.serviceName },
          { field: '@message', value: message },
        ]),
      },
    ]);

    const result = await new AnalyzeAuditFallbackStep().execute(ctx);

    assert.strictEqual(result.vars?.[AUDIT_FALLBACK_SEQUENCE_CONFIRMED_VAR], 'true');
    assert.strictEqual(result.vars?.[AUDIT_FALLBACK_CONFIRMED_VAR], 'false');
    assert.strictEqual(result.output?.additionalApplicationErrors, 1);
  });

  it('fails closed when the application evidence reaches the query row limit', async () => {
    const ctx = context();
    ctx.stepResults.set(alarm.stepIds.queryApplicationLogs, [
      [
        { field: 'cid', value: 'a' },
        { field: '@message', value: `[CID=a] ${AUDIT_FALLBACK_PATTERN}` },
      ],
      ...Array.from({ length: INTEROP_API_GW_APPLICATION_QUERY_LIMIT - 1 }, () => [
        { field: 'cid', value: 'a' },
        { field: '@message', value: `[CID=a] ${AUDIT_FALLBACK_PATTERN}` },
      ]),
    ]);
    ctx.stepResults.set(alarm.stepIds.queryCidTracker, [
      {
        cid: 'a',
        rows: SUCCESS.map((message) => [
          { field: 'pod_app', value: alarm.serviceName },
          { field: '@message', value: message },
        ]),
      },
    ]);

    const result = await new AnalyzeAuditFallbackStep().execute(ctx);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.vars?.[AUDIT_FALLBACK_CONFIRMED_VAR], 'false');
    assert.deepStrictEqual(result.output, {
      confirmedCids: ['a'],
      unresolvedCids: [],
      uncorrelatedErrors: 0,
      additionalApplicationErrors: 0,
      applicationEvidenceComplete: false,
    });
  });
});
