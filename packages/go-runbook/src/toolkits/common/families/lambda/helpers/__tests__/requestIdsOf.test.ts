import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { requestIdsOf } from '../requestIdsOf.js';
import { logRow } from '../../../../../../__tests__/helpers/logRow.js';

const A = '0f3e2b4a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const B = '1a1bf5ea-2088-4ea7-9133-12fcbfaabacc';

describe('requestIdsOf', () => {
  it('collects each usable request id once, structured or named by the message, in row order', () => {
    assert.deepStrictEqual(
      requestIdsOf([
        logRow({ '@requestId': ` ${B} ` }),
        logRow({ '@message': `START RequestId: ${A} Version: $LATEST` }),
        logRow({ '@requestId': B }),
        logRow({ '@requestId': "bad'id" }),
        logRow({ '@message': 'no request id' }),
      ]),
      [B, A],
    );
  });
});
