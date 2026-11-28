import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { StepResult } from '../../../../../engine/index.js';
import { conditionContext } from '../../../shared/__tests__/helpers/knownErrorTesting.js';
import type { LogRows } from '../../../../../__tests__/helpers/LogRows.js';
import { AnalyzeAttEservicesAccessStep, type AttEservicesAccessAnalysis } from '../AnalyzeAttEservicesAccessStep.js';
import { API_GW_ID, QUERY_STEP_ID } from '../alarmDefinition.js';

function row(overrides: Readonly<Record<string, string>> = {}): LogRows[number] {
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

async function analyze(rows?: LogRows): Promise<StepResult<AttEservicesAccessAnalysis>> {
  return new AnalyzeAttEservicesAccessStep().execute(
    conditionContext(rows === undefined ? [] : [[QUERY_STEP_ID, rows]]),
  );
}

describe('AnalyzeAttEservicesAccessStep', () => {
  it('recognizes the observed API-rejected requests on any path and method, and reports counts and paths', async () => {
    const result = await analyze([
      row(),
      row({ requestPath: '/.env' }),
      row({ requestPath: '/xmlrpc.php', httpMethod: 'POST' }),
    ]);
    assert.equal(result.success, true);
    assert.deepEqual(result.output, {
      requestCount: 3,
      rejectedBeforeIntegrationCount: 3,
      allRejectedBeforeIntegration: true,
      coverageLimited: false,
      paths: ['/', '/.env', '/xmlrpc.php'],
      statusCounts: { '403': 3 },
    });
    assert.equal(result.vars?.['interopEnvironment'], 'att');
    assert.equal(result.vars?.['attEservicesAllRejectedBeforeIntegration'], 'true');
  });

  it('does not infer a case from an empty result', async () => {
    const result = await analyze([]);
    assert.equal(result.output?.requestCount, 0);
    assert.equal(result.output?.allRejectedBeforeIntegration, false);
  });

  it('rejects other APIs, statuses and integration results', async () => {
    for (const override of [
      { apigwId: 'another-api' },
      { status: '400' },
      { status: '401' },
      { status: '404' },
      { status: '4030' },
      { integrationStatus: '403' },
      { integrationStatus: '200' },
      { integrationError: 'Integration failure' },
    ]) {
      const result = await analyze([row(override)]);
      assert.equal(result.output?.allRejectedBeforeIntegration, false, JSON.stringify(override));
      assert.equal(result.output?.rejectedBeforeIntegrationCount, 0);
    }
  });

  it('requires explicit fields rather than treating absent integration data as proof', async () => {
    for (const field of ['apigwId', 'status', 'requestPath', 'integrationStatus', 'integrationError']) {
      const result = await analyze([row().filter((entry) => entry.field !== field)]);
      assert.equal(result.output?.allRejectedBeforeIntegration, false, field);
    }
  });

  it('keeps mixed windows open when one request reached the integration', async () => {
    const result = await analyze([
      row(),
      row({ status: '401', requestPath: '/residence-verification/status', integrationStatus: '401' }),
    ]);
    assert.equal(result.output?.rejectedBeforeIntegrationCount, 1);
    assert.equal(result.output?.allRejectedBeforeIntegration, false);
    assert.deepEqual(result.output?.statusCounts, { '403': 1, '401': 1 });
  });

  it('does not classify a potentially saturated window', async () => {
    const result = await analyze(Array.from({ length: 1000 }, () => row()));
    assert.equal(result.output?.coverageLimited, true);
    assert.equal(result.output?.allRejectedBeforeIntegration, false);
  });

  it('keeps source IPs and opaque event pointers out of derived diagnostics', async () => {
    const result = await analyze([row({ sourceIp: '203.0.113.123', '@ptr': 'opaque-event-pointer' })]);
    const diagnostics = JSON.stringify({ output: result.output, vars: result.vars });
    assert.ok(!diagnostics.includes('203.0.113.123'));
    assert.ok(!diagnostics.includes('opaque-event-pointer'));
  });

  it('reports missing upstream evidence as a failure', async () => {
    const result = await analyze();
    assert.equal(result.success, false);
  });
});
