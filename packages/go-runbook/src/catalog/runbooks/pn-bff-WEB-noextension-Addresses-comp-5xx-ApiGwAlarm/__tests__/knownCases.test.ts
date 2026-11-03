import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConditionEvaluator, type RunbookContext } from '../../framework.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { KNOWN_CASES } from '../knownCases.js';

const TIMEOUT =
  'Ending process _getAddressesV1 with errors=nested exception is io.netty.handler.timeout.ReadTimeoutException';

function context(
  messages: ReadonlyArray<string>,
  status = '500',
  method = 'GET',
  path = '/bff/v1/addresses',
  stepId = 'query-pn-bff',
): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-10-15T12:00:29.929Z'),
    params: new Map(),
    vars: new Map([
      ['apiGwStatusCode', status],
      ['apiGwHttpMethod', method],
      ['apiGwPath', path],
    ]),
    stepResults: new Map([[stepId, messages.map((value) => [{ field: '@message', value }])]]),
    services: createTestServiceRegistry(),
    logs: [],
    recoveredErrors: [],
  };
}

function matches(ctx: RunbookContext): boolean {
  const candidate = KNOWN_CASES[0];
  assert.ok(candidate);
  return new ConditionEvaluator().evaluate(candidate.condition, ctx);
}

describe('Addresses documented read timeout', () => {
  it('recognizes the exact source signature in raw and structured BFF logs', () => {
    assert.equal(matches(context([TIMEOUT])), true);
    assert.equal(matches(context([JSON.stringify({ level: 'WARN', message: TIMEOUT })])), true);
    assert.equal(matches(context([TIMEOUT], '500', 'GET', '/v1/addresses')), true);
  });

  it('requires the matching HTTP status, method and exact Addresses endpoint', () => {
    for (const [status, method, path] of [
      ['502', 'GET', '/bff/v1/addresses'],
      ['400', 'GET', '/bff/v1/addresses'],
      ['500', 'POST', '/bff/v1/addresses'],
      ['500', 'DELETE', '/bff/v1/addresses/LEGAL/default/PEC'],
      ['500', 'GET', '/bff/v1/notifications/received'],
      ['500', 'GET', '/bff/v1/addresses/other'],
      ['500', 'GET', '/other/bff/v1/addresses'],
    ])
      assert.equal(matches(context([TIMEOUT], status, method, path)), false);
  });

  it('keeps generic timeouts, other operations and near matches unknown', () => {
    for (const message of [
      'io.netty.handler.timeout.ReadTimeoutException',
      TIMEOUT.replace('_getAddressesV1', '_getNotificationReceivedV1'),
      TIMEOUT.replace('ReadTimeoutException', 'ConnectTimeoutException'),
      `${TIMEOUT}Other`,
      'Internal Server Error: FALLBACK-UUID:synthetic',
    ])
      assert.equal(matches(context([message])), false);
  });

  it('does not combine fragments from separate log rows', () => {
    assert.equal(
      matches(
        context([
          'Ending process _getAddressesV1 with errors=nested exception is',
          'io.netty.handler.timeout.ReadTimeoutException',
        ]),
      ),
      false,
    );
  });

  it('does not attribute another service or execution-log timeout to pn-bff', () => {
    for (const stepId of ['query-pn-user-attributes', 'query-api-gw-execution-logs']) {
      assert.equal(matches(context([TIMEOUT], '500', 'GET', '/bff/v1/addresses', stepId)), false);
    }
  });

  it('preserves the missing resolution and leaves the case in progress', () => {
    assert.equal(KNOWN_CASES.length, 1);
    const candidate = KNOWN_CASES[0];
    assert.equal(candidate?.analysis?.resolution, 'Risoluzione non documentata.');
    assert.equal(candidate?.analysis?.proposedStatus, 'IN_PROGRESS');
    assert.equal(candidate?.analysis?.analysisType, 'ANALYZABLE');
    assert.deepEqual(candidate?.analysis?.finalActions, []);
    assert.deepEqual(candidate?.analysis?.resources, [{ name: 'pn-user-attributes' }]);
    assert.equal(candidate?.analysis?.downstreams, undefined);
  });
});
