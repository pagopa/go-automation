import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { KNOWN_ERRORS } from '../knownErrors.js';
import { createTestContext } from '../../../../../__tests__/helpers/createTestContext.js';
import { caseMatches, knownErrorById } from '../../../../../__tests__/helpers/knownErrorMatching.js';

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

function matches(knownErrorCode: string, messages: ReadonlyArray<string>, field = 'message'): boolean {
  const stepResults = { 'query-pn-external-registries': messages.map((value) => [{ field, value }]) };
  return caseMatches(knownErrorById(KNOWN_ERRORS, knownErrorCode), createTestContext({ stepResults }));
}

describe('external-registries IO downstream known errors', () => {
  const documented = [
    ['SEND_DOWNSTREAM_PERIODDA_IO-ACT-COS-CON', ACTIVATION_CONFLICT],
    ['SEND_DOWNSTREAM_PERIODDA_IO-ACT-NOT-FOU', ACTIVATION_NOT_FOUND],
    ['SEND_DOWNSTREAM_PERIODDA_IO-REA-TIM', TIMEOUT],
    ['SEND_DOWNSTREAM_PERIODDA_IO-MES-INV-JSO-RES-500', INVALID_JSON],
  ] as const;

  it('recognizes documented signatures in structured, raw and JSON-encoded evidence', () => {
    for (const [id, message] of documented) {
      assert.strictEqual(matches(id, [message]), true);
      assert.strictEqual(matches(id, [message], '@message'), true);
      assert.strictEqual(matches(id, [JSON.stringify({ level: 'ERROR', message })], '@message'), true);
      assert.deepStrictEqual(
        KNOWN_ERRORS.filter((c) => matches(c.code, [message])).map((c) => c.code),
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
        KNOWN_ERRORS.filter((c) => matches(c.code, [message])),
        [],
      );
    }
  });

  it('does not hard-code the configuration ID from the incident', () => {
    assert.strictEqual(
      matches('SEND_DOWNSTREAM_PERIODDA_IO-MES-INV-JSO-RES-500', [
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
      assert.strictEqual(matches('SEND_DOWNSTREAM_PERIODDA_IO-REA-TIM', [message]), false);
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
      assert.strictEqual(matches('SEND_DOWNSTREAM_PERIODDA_IO-MES-INV-JSO-RES-500', [message]), false);
    }
    assert.strictEqual(
      matches('SEND_DOWNSTREAM_PERIODDA_IO-MES-INV-JSO-RES-500', [HTTP_ERROR, INVALID_JSON_DETAIL]),
      false,
    );
  });
});
