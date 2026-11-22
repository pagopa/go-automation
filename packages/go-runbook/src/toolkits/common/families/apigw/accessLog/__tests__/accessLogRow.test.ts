import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { SEND_API_GW_PROFILE } from '../../../../../send/families/apigw/profiles/SEND_API_GW_PROFILE.js';
import {
  pickHighestStatusCode,
  pickPrimaryStatusCode,
  readAccessLogField,
  rowMeetsThreshold,
} from '../accessLogRow.js';
import { logRow } from '../../../../../../__tests__/helpers/logRow.js';

const SCHEMA = SEND_API_GW_PROFILE.accessLog.schema;

describe('readAccessLogField', () => {
  it('reads a trimmed value and nothing for a missing, blank or sentinel one', () => {
    const row = logRow({ path: ' /v1/foo ', httpMethod: '-', errorMessage: '  ' });
    assert.strictEqual(readAccessLogField(row, 'path', SCHEMA), '/v1/foo');
    assert.strictEqual(readAccessLogField(row, 'httpMethod', SCHEMA), undefined);
    assert.strictEqual(readAccessLogField(row, 'errorMessage', SCHEMA), undefined);
    assert.strictEqual(readAccessLogField(row, 'requestId', SCHEMA), undefined);
  });
});

describe('status codes of an access-log row', () => {
  it('skip sentinels and non-numeric values, in the declaration order of the schema', () => {
    const [primary, secondary] = SCHEMA.statusFields;
    assert.ok(primary !== undefined && secondary !== undefined);
    const row = logRow({ [primary]: '-', [secondary]: '502' });
    assert.strictEqual(pickPrimaryStatusCode(row, SCHEMA), '502');
    assert.strictEqual(pickHighestStatusCode(row, SCHEMA), 502);
    assert.strictEqual(rowMeetsThreshold(row, 500, SCHEMA), true);
    assert.strictEqual(rowMeetsThreshold(row, 503, SCHEMA), false);
    assert.strictEqual(pickPrimaryStatusCode(logRow({ [primary]: 'n/a' }), SCHEMA), '');
    assert.strictEqual(pickHighestStatusCode(logRow({}), SCHEMA), undefined);
  });
});
