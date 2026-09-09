import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ConditionEvaluator, SEND_DOWNSTREAMS } from '../../framework.js';
import type { RunbookContext } from '../../framework.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { KNOWN_CASES } from '../knownCases.js';

const TIMEOUT = '[DOWNSTREAM] Service IO returned errors=io.netty.handler.timeout.ReadTimeoutException';
const HTTP_ERROR =
  '[DOWNSTREAM] Service IO returned errors=500 Internal Server Error from POST https://api.io.pagopa.it/api/v1/messages;';
const INVALID_JSON_DETAIL =
  'invalid json response body at https://api-app.internal.io.pagopa.it/api/v1/messages-sending/' +
  'remote-contents/configurations/01HMVMHCZZ8D0VTFWMRHBM5D6F reason: Unexpected end of JSON input';
const INVALID_JSON =
  HTTP_ERROR + JSON.stringify({ detail: INVALID_JSON_DETAIL, status: 500, title: 'Internal server error' });

function contextWithMessages(messages: ReadonlyArray<string>, field = 'message'): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-09-07T10:00:00.000Z'),
    stepResults: new Map([['query-pn-external-registries', messages.map((value) => [{ field, value }])]]),
    vars: new Map(),
    params: new Map(),
    logs: [],
    services: createTestServiceRegistry(),
    recoveredErrors: [],
  };
}

function matches(caseId: string, messages: ReadonlyArray<string>, field = 'message'): boolean {
  const knownCase = KNOWN_CASES.find(({ id }) => id === caseId);
  assert.ok(knownCase);
  return new ConditionEvaluator().evaluate(knownCase.condition, contextWithMessages(messages, field));
}

describe('external-registries IO downstream known cases', () => {
  it('declares exactly the two documented cases with distinct priorities', () => {
    assert.deepStrictEqual(KNOWN_CASES.map(({ id }) => id).sort(), [
      'io-messages-invalid-json-response-500',
      'io-read-timeout',
    ]);
    assert.strictEqual(new Set(KNOWN_CASES.map(({ priority }) => priority)).size, 2);
  });

  it('recognizes both documented errors in structured and raw JSON log evidence', () => {
    for (const [caseId, message] of [
      ['io-read-timeout', TIMEOUT],
      ['io-messages-invalid-json-response-500', INVALID_JSON],
    ] as const) {
      assert.strictEqual(matches(caseId, [message]), true);
      assert.strictEqual(matches(caseId, [message], '@message'), true);
      assert.strictEqual(matches(caseId, [JSON.stringify({ level: 'ERROR', message })], '@message'), true);
    }
  });

  it('does not hard-code the configuration identifier from the incident', () => {
    assert.strictEqual(
      matches('io-messages-invalid-json-response-500', [
        INVALID_JSON.replace('01HMVMHCZZ8D0VTFWMRHBM5D6F', '01NEWCONFIGURATION123456789'),
      ]),
      true,
    );
  });

  it('does not classify another downstream or exception as an IO read timeout', () => {
    for (const message of [
      TIMEOUT.replace('Service IO ', 'Service OneTrust '),
      TIMEOUT.replace('ReadTimeoutException', 'ConnectTimeoutException'),
      TIMEOUT.replace('ReadTimeoutException', 'ReadTimeoutExceptionOther'),
      'io.netty.handler.timeout.ReadTimeoutException',
    ]) {
      assert.strictEqual(matches('io-read-timeout', [message]), false, message);
    }
  });

  it('requires the specific downstream, status, method, endpoints and JSON failure', () => {
    for (const message of [
      INVALID_JSON.replace('Service IO ', 'Service OneTrust '),
      INVALID_JSON.replace('500 Internal Server Error from', '503 Service Unavailable from'),
      INVALID_JSON.replace('from POST', 'from GET'),
      INVALID_JSON.replace('api.io.pagopa.it/api/v1/messages;', 'api.io.pagopa.it/api/v1/profiles;'),
      INVALID_JSON.replace('api-app.internal.io.pagopa.it', 'another.internal.io.pagopa.it'),
      INVALID_JSON.replace('remote-contents/configurations/', 'remote-contents/other/'),
      INVALID_JSON.replace('Unexpected end of JSON input', 'Unexpected token in JSON'),
      `${HTTP_ERROR}{"detail":"unrelated error","status":500}`,
      TIMEOUT,
    ]) {
      assert.strictEqual(matches('io-messages-invalid-json-response-500', [message]), false, message);
    }
  });

  it('does not join an unrelated HTTP error and a JSON failure from separate rows', () => {
    assert.strictEqual(matches('io-messages-invalid-json-response-500', [HTTP_ERROR, INVALID_JSON_DETAIL]), false);
  });

  it('leaves empty or unknown evidence to the standard fallback', () => {
    for (const { id } of KNOWN_CASES) {
      assert.strictEqual(matches(id, []), false);
      assert.strictEqual(matches(id, ['[DOWNSTREAM] Service IO returned errors=429 Too Many Requests']), false);
    }
  });

  it('keeps unresolved cases open without inventing final actions', () => {
    for (const knownCase of KNOWN_CASES) {
      assert.strictEqual(knownCase.analysis?.proposedStatus, 'IN_PROGRESS');
      assert.strictEqual(knownCase.analysis?.analysisType, 'ANALYZABLE');
      assert.deepStrictEqual(knownCase.analysis?.downstreams, [SEND_DOWNSTREAMS.APP_IO]);
      assert.strictEqual(knownCase.analysis?.finalActions, undefined);
      assert.match(knownCase.analysis?.resolution ?? '', /Mantenere l’analisi aperta/u);
    }
    const httpCase = KNOWN_CASES.find(({ id }) => id === 'io-messages-invalid-json-response-500');
    assert.deepStrictEqual(
      httpCase?.analysis?.links?.map(({ url }) => url),
      [
        'https://pagopaspa.slack.com/archives/C087KRMD16E/p1788777409771749',
        'https://pagopaspa.slack.com/archives/C064KJYNLPL/p1788778720713519',
      ],
    );
    assert.ok(httpCase?.analysis?.links?.every(({ type }) => type === 'SLACK'));
  });
});
