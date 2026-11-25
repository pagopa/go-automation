import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { httpError, transportError } from '../../__tests__/helpers/FakeB2BApi.js';
import { classifySendFailure } from '../classifySendFailure.js';

const problem = (code: string, element?: string): unknown => ({
  status: 400,
  title: 'Bad Request',
  errors: [{ code, ...(element !== undefined && { element }), detail: 'detail' }],
});

describe('classifySendFailure', () => {
  it('classifies row errors and global 400 codes', () => {
    const row = classifySendFailure(
      httpError(400, problem('PN_GENERIC_INVALIDPARAMETER_PATTERN', 'recipients[0].taxId')),
    );
    assert.equal(row.kind, 'row');
    assert.equal(row.code, 'PN_GENERIC_INVALIDPARAMETER_PATTERN');
    assert.match(row.details ?? '', /recipients\[0\]\.taxId/);

    for (const code of [
      'PN_DELIVERY_INVALIDPARAMETER_GROUP',
      'PN_DELIVERY_NOTIFICATION_LIMIT_EXCEEDED',
      'PN_DELIVERY_SEND_IS_DISABLED',
    ]) {
      assert.equal(classifySendFailure(httpError(400, problem(code))).kind, 'global', code);
    }
  });

  it('treats 401 and 403 (sender tax id) as global', () => {
    assert.equal(classifySendFailure(httpError(401)).kind, 'global');
    const forbidden = classifySendFailure(httpError(403, problem('PN_DELIVERY_INVALID_SENDER_TAX_ID')));
    assert.equal(forbidden.kind, 'global');
    assert.equal(forbidden.code, 'PN_DELIVERY_INVALID_SENDER_TAX_ID');
  });

  it('tells the two 409 apart by element', () => {
    const duplicate = classifySendFailure(
      httpError(409, problem('PN_GENERIC_INVALIDPARAMETER_DUPLICATED', '00000000001##GO-run-1##run-1')),
    );
    assert.equal(duplicate.kind, 'duplicate');
    const notice = classifySendFailure(
      httpError(409, problem('PN_GENERIC_INVALIDPARAMETER_DUPLICATED', '00000000001##302000000000000001')),
    );
    assert.equal(notice.kind, 'row');
    assert.equal(notice.code, 'DUPLICATE_NOTICE_CODE');
  });

  it('classifies 429 as throttled and 5xx/timeouts as ambiguous', () => {
    const throttled = classifySendFailure(httpError(429, undefined, 2_000));
    assert.equal(throttled.kind, 'throttled');
    assert.equal(throttled.retryAfterMs, 2_000);
    for (const status of [408, 500, 502, 503, 504]) {
      assert.equal(classifySendFailure(httpError(status)).kind, 'ambiguous', String(status));
    }
    assert.equal(classifySendFailure(transportError()).kind, 'ambiguous');
    assert.equal(classifySendFailure(new Error('boom')).kind, 'ambiguous');
  });
});
