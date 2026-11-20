import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { extractLambdaRequestId } from '../extractLambdaRequestId.js';

describe('extractLambdaRequestId', () => {
  it('extracts the id from REPORT, START, inline and tab-separated application lines', () => {
    for (const [line, expected] of [
      [
        'REPORT RequestId: d848f0c5-1089-5c2b-9a3b-91a94511ee52  Duration: 10000.00 ms',
        'd848f0c5-1089-5c2b-9a3b-91a94511ee52',
      ],
      [
        'START RequestId: 11111111-2222-3333-4444-555555555555 Version: $LATEST',
        '11111111-2222-3333-4444-555555555555',
      ],
      [
        '[INFO] handler done RequestId: aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee extra',
        'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      ],
      [
        '2026-01-01T00:00:00.000Z\t11111111-2222-3333-4444-555555555555\tERROR\tInvoke Error',
        '11111111-2222-3333-4444-555555555555',
      ],
    ] as const) {
      assert.strictEqual(extractLambdaRequestId(line), expected, line);
    }
  });

  it('prefers the invocation of the line to a request id quoted in its message', () => {
    assert.strictEqual(
      extractLambdaRequestId(
        '2026-01-01T00:00:00.000Z\t11111111-2222-3333-4444-555555555555\tERROR\t' +
          'retry failed after RequestId: aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      ),
      '11111111-2222-3333-4444-555555555555',
    );
    assert.strictEqual(
      extractLambdaRequestId('[INFO] previous END RequestId: aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    );
  });

  it('returns undefined when no request id is present', () => {
    assert.strictEqual(extractLambdaRequestId('just a log line'), undefined);
  });
});
