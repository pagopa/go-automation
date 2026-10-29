import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ResultField } from '@go-automation/go-common/aws';
import type { RunbookContext } from '../../../../types/RunbookContext.js';
import type { StepResult } from '../../../../types/StepResult.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { AnalyzeAttEservicesAccessStep, type AttEservicesAccessAnalysis } from '../AnalyzeAttEservicesAccessStep.js';
import { API_GW_ID, QUERY_STEP_ID } from '../alarmDefinition.js';

function row(overrides: Readonly<Record<string, string>> = {}): ReadonlyArray<ResultField> {
  return Object.entries({
    apigwId: API_GW_ID,
    status: '403',
    httpMethod: 'GET',
    requestPath: '/',
    integrationStatus: '-',
    integrationError: '-',
    ...overrides,
  }).map(([field, value]) => ({ field, value }));
}

interface TestAnalysis {
  readonly result: StepResult<AttEservicesAccessAnalysis>;
  readonly context: RunbookContext;
}

async function analyze(rows?: ReadonlyArray<ReadonlyArray<ResultField>>): Promise<TestAnalysis> {
  const context: RunbookContext = {
    executionId: 'test',
    startedAt: new Date('2026-10-29T04:41:26.000Z'),
    vars: new Map(),
    params: new Map(),
    stepResults: rows === undefined ? new Map() : new Map([[QUERY_STEP_ID, rows]]),
    logs: [],
    recoveredErrors: [],
    services: createTestServiceRegistry(),
  };
  const result = await new AnalyzeAttEservicesAccessStep().execute(context);
  return { result, context };
}

describe('AnalyzeAttEservicesAccessStep', () => {
  it('recognizes the observed API-rejected requests and reports counts and paths', async () => {
    const { result } = await analyze([
      row(),
      row({ requestPath: '/favicon.ico' }),
      row({ requestPath: '/h/printcontacts' }),
    ]);
    assert.equal(result.success, true);
    assert.deepEqual(result.output, {
      requestCount: 3,
      documentedProbeCount: 3,
      allDocumentedProbes: true,
      coverageLimited: false,
      paths: ['/', '/favicon.ico', '/h/printcontacts'],
      statusCounts: { '403': 3 },
    });
    assert.equal(result.vars?.['interopEnvironment'], 'att');
    assert.equal(result.vars?.['attEservicesAllDocumentedProbes'], 'true');
  });

  it('does not infer a case from an empty result', async () => {
    const { result } = await analyze([]);
    assert.equal(result.output?.requestCount, 0);
    assert.equal(result.output?.allDocumentedProbes, false);
  });

  it('rejects other APIs, statuses, methods, paths and integration results', async () => {
    for (const override of [
      { apigwId: 'another-api' },
      { status: '401' },
      { status: '404' },
      { status: '4030' },
      { httpMethod: 'POST' },
      { requestPath: '/residence-verification/status' },
      { requestPath: '/residence-submission/status' },
      { requestPath: '/wp-admin' },
      { requestPath: '/favicon.ico?query=unexpected' },
      { integrationStatus: '403' },
      { integrationStatus: '200' },
      { integrationError: 'Integration failure' },
    ]) {
      const { result } = await analyze([row(override)]);
      assert.equal(result.output?.allDocumentedProbes, false, JSON.stringify(override));
      assert.equal(result.output?.documentedProbeCount, 0);
    }
  });

  it('requires explicit fields rather than treating absent integration data as proof', async () => {
    for (const field of ['apigwId', 'status', 'httpMethod', 'requestPath', 'integrationStatus', 'integrationError']) {
      const { result } = await analyze([row().filter((entry) => entry.field !== field)]);
      assert.equal(result.output?.allDocumentedProbes, false, field);
    }
  });

  it('keeps mixed windows open when one request differs from the documented case', async () => {
    const { result } = await analyze([row(), row({ status: '401', requestPath: '/residence-verification/status' })]);
    assert.equal(result.output?.documentedProbeCount, 1);
    assert.equal(result.output?.allDocumentedProbes, false);
    assert.deepEqual(result.output?.statusCounts, { '403': 1, '401': 1 });
  });

  it('does not combine status and path evidence from different requests', async () => {
    const { result } = await analyze([
      row({ requestPath: '/residence-submission/status' }),
      row({ status: '404', requestPath: '/favicon.ico' }),
    ]);
    assert.equal(result.output?.documentedProbeCount, 0);
    assert.equal(result.output?.allDocumentedProbes, false);
  });

  it('does not classify a potentially saturated window', async () => {
    const { result } = await analyze(Array.from({ length: 1000 }, () => row()));
    assert.equal(result.output?.coverageLimited, true);
    assert.equal(result.output?.allDocumentedProbes, false);
  });

  it('keeps source IPs and opaque event pointers out of derived diagnostics', async () => {
    const { result } = await analyze([row({ sourceIp: '203.0.113.123', '@ptr': 'opaque-event-pointer' })]);
    const diagnostics = JSON.stringify({ output: result.output, vars: result.vars });
    assert.ok(!diagnostics.includes('203.0.113.123'));
    assert.ok(!diagnostics.includes('opaque-event-pointer'));
  });

  it('reports missing upstream evidence as a failure', async () => {
    const { result } = await analyze();
    assert.equal(result.success, false);
  });
});
