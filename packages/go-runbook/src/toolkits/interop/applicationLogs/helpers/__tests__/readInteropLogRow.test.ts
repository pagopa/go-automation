import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { readInteropLogRow } from '../readInteropLogRow.js';
import { logRow } from '../../../../../__tests__/helpers/logRow.js';

describe('readInteropLogRow', () => {
  it('reads the log of the k8s envelope, its pod app, the CID it writes and the time', () => {
    const row = logRow({
      '@timestamp': '2026-01-01T00:00:00.000Z',
      '@message': JSON.stringify({ log: 'ERROR [CID=abc-1] boom', pod_app: 'interop-be-bff' }),
    });
    assert.deepStrictEqual(readInteropLogRow(row), {
      podApp: 'interop-be-bff',
      message: 'ERROR [CID=abc-1] boom',
      cid: 'abc-1',
      timestamp: '2026-01-01T00:00:00.000Z',
    });
  });

  it('prefers the CID of the tracker read, then the cid field, to the one in the message', () => {
    const row = logRow({ pod_app: 'interop-be-x', cid: ' field-cid ', log: 'plain [CID=message-cid]' });
    assert.strictEqual(readInteropLogRow(row).cid, 'field-cid');
    assert.strictEqual(readInteropLogRow(row, 'tracker-cid').cid, 'tracker-cid');
    assert.strictEqual(readInteropLogRow(logRow({ cid: ' ', log: 'plain [CID=message-cid]' })).cid, 'message-cid');
    assert.deepStrictEqual(readInteropLogRow(logRow({ '@message': 'no correlation' })), {
      podApp: '',
      message: 'no correlation',
    });
  });
});
