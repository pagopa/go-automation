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
const METER_NOT_FOUND =
  "[DOWNSTREAM] Service IO returned errors=Unable to find a meter that matches all the requirements at once. Here's what was found:\n" +
  "OK: A meter with name 'NumberOfIOMessageSentSuccessfully' was found.";
const ACTIVATION_PREFIX =
  '[DOWNSTREAM] Service IO returned errors=500 Internal Server Error from PUT ' +
  'https://api.io.pagopa.it/api/v1/activations/;';
const ACTIVATION_CONFLICT = `${ACTIVATION_PREFIX}${JSON.stringify({
  detail: 'Error upserting service Activation',
  title: 'Query error (COSMOS_ERROR_RESPONSE)$ (409/Entity with the specified id already exists in the system.)',
})}`;
const ACTIVATION_TIMEOUT = `${ACTIVATION_PREFIX}${JSON.stringify({
  detail: 'Error upserting service Activation',
  title: 'Query error (COSMOS_ERROR_RESPONSE)$ (408/Message: The requested operation exceeded maximum alloted time.)',
})}`;
const ACTIVATION_ROUTING = `${ACTIVATION_PREFIX}${JSON.stringify({
  detail: 'Error upserting service Activation',
  title: 'Query error (COSMOS_ERROR_RESPONSE)$ (408/An error occurred while routing the request)',
})}`;
const ACTIVATION_NOT_FOUND =
  '[DOWNSTREAM] Service IO returned errors=404 Not Found from POST ' +
  'https://api.io.pagopa.it/api/v1/activations/;' +
  '{"detail":"Activation not found for the user","status":404,"title":"Not Found"}';
const MESSAGE_CONNECTION_RESET =
  HTTP_ERROR +
  JSON.stringify({
    detail:
      'request to https://api-app.internal.io.pagopa.it/api/v1/messages-sending/remote-contents/configurations/' +
      '01HMVMHCZZ8D0VTFWMRHBM5D6F failed, reason: read ECONNRESET',
    status: 500,
  });
const MESSAGE_COSMOS_UNAVAILABLE =
  HTTP_ERROR +
  JSON.stringify({
    detail: { error: { code: 503, body: { code: 'ServiceUnavailable', message: 'Channel is closed' } } },
  });
const MESSAGE_GENERIC_ERROR =
  HTTP_ERROR + JSON.stringify({ statusCode: 500, message: 'Internal server error', activityId: 'activity-1' });

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
  const documented = [
    ['io-activation-cosmos-conflict', ACTIVATION_CONFLICT],
    ['io-activation-not-found', ACTIVATION_NOT_FOUND],
    ['io-read-timeout', TIMEOUT],
    ['io-messages-invalid-json-response-500', INVALID_JSON],
  ] as const;

  it('recognizes documented signatures in structured, raw and JSON-encoded evidence', () => {
    assert.deepStrictEqual(KNOWN_CASES.map(({ id }) => id).sort(), documented.map(([id]) => id).sort());
    assert.strictEqual(new Set(KNOWN_CASES.map(({ priority }) => priority)).size, KNOWN_CASES.length);
    for (const [id, message] of documented) {
      assert.strictEqual(matches(id, [message]), true);
      assert.strictEqual(matches(id, [message], '@message'), true);
      assert.strictEqual(matches(id, [JSON.stringify({ level: 'ERROR', message })], '@message'), true);
      assert.deepStrictEqual(
        KNOWN_CASES.filter((c) => matches(c.id, [message])).map((c) => c.id),
        [id],
      );
    }
  });

  it('leaves unverified additions unknown instead of prescribing their resolution', () => {
    for (const message of [
      METER_NOT_FOUND,
      ACTIVATION_TIMEOUT,
      ACTIVATION_ROUTING,
      MESSAGE_CONNECTION_RESET,
      MESSAGE_COSMOS_UNAVAILABLE,
      MESSAGE_GENERIC_ERROR,
    ]) {
      assert.deepStrictEqual(
        KNOWN_CASES.filter((c) => matches(c.id, [message])),
        [],
      );
    }
  });

  it('does not hard-code the configuration ID from the incident', () => {
    assert.strictEqual(
      matches('io-messages-invalid-json-response-500', [
        INVALID_JSON.replace('01HMVMHCZZ8D0VTFWMRHBM5D6F', '01NEWCONFIGURATION123456789'),
      ]),
      true,
    );
  });

  it('requires the IO downstream and the complete timeout or JSON signature', () => {
    for (const message of [
      TIMEOUT.replace('Service IO ', 'Service OneTrust '),
      TIMEOUT.replace('ReadTimeoutException', 'ConnectTimeoutException'),
      TIMEOUT.replace('ReadTimeoutException', 'ReadTimeoutExceptionOther'),
      'io.netty.handler.timeout.ReadTimeoutException',
    ]) {
      assert.strictEqual(matches('io-read-timeout', [message]), false);
    }
    for (const message of [
      INVALID_JSON.replace('Service IO ', 'Service OneTrust '),
      INVALID_JSON.replace('from POST', 'from GET'),
      INVALID_JSON.replace('500 Internal Server Error from', '503 Service Unavailable from'),
      INVALID_JSON.replace('remote-contents/configurations/', 'remote-contents/other/'),
      INVALID_JSON.replace('Unexpected end of JSON input', 'Unexpected token in JSON'),
      INVALID_JSON.replace('JSON input', 'JSON inputs'),
      TIMEOUT,
    ]) {
      assert.strictEqual(matches('io-messages-invalid-json-response-500', [message]), false);
    }
    assert.strictEqual(matches('io-messages-invalid-json-response-500', [HTTP_ERROR, INVALID_JSON_DETAIL]), false);
  });

  it('does not close undocumented resolutions or assign IO internal operations', () => {
    for (const c of KNOWN_CASES) {
      assert.strictEqual(c.analysis?.proposedStatus, 'IN_PROGRESS');
      assert.deepStrictEqual(c.analysis?.downstreams, [SEND_DOWNSTREAMS.APP_IO]);
      assert.deepStrictEqual(c.analysis?.finalActions ?? [], []);
      assert.doesNotMatch(c.analysis?.resolution ?? '', /verificare.*Cosmos|connettività|deployment/iu);
    }
    const conflict = KNOWN_CASES.find((c) => c.id === 'io-activation-cosmos-conflict');
    assert.match(conflict?.analysis?.resolution ?? '', /Segnalare a Infra/u);
    const json = KNOWN_CASES.find((c) => c.id === 'io-messages-invalid-json-response-500');
    assert.ok(json?.analysis?.links?.some((l) => l.url === 'https://pagopa.atlassian.net/browse/PN-21426'));
  });
});
