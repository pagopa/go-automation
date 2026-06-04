import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { extractLambdaRequestId } from '../extractLambdaRequestId.js';

describe('extractLambdaRequestId', () => {
  it('extracts the id from a REPORT line', () => {
    const line = 'REPORT RequestId: d848f0c5-1089-5c2b-9a3b-91a94511ee52  Duration: 10000.00 ms';
    assert.strictEqual(extractLambdaRequestId(line), 'd848f0c5-1089-5c2b-9a3b-91a94511ee52');
  });

  it('extracts the id from a START line', () => {
    const line = 'START RequestId: 11111111-2222-3333-4444-555555555555 Version: $LATEST';
    assert.strictEqual(extractLambdaRequestId(line), '11111111-2222-3333-4444-555555555555');
  });

  it('extracts an inline request id from an application log', () => {
    const line = '[INFO] handler done RequestId: aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee extra';
    assert.strictEqual(extractLambdaRequestId(line), 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  });

  it('extracts the id from the standard tab-separated Lambda application line', () => {
    const line = '2026-01-01T00:00:00.000Z\t11111111-2222-3333-4444-555555555555\tERROR\tInvoke Error';
    assert.strictEqual(extractLambdaRequestId(line), '11111111-2222-3333-4444-555555555555');
  });

  it('returns undefined when no request id is present', () => {
    assert.strictEqual(extractLambdaRequestId('just a log line'), undefined);
  });
});
