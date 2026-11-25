import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { extractFileNameFromCwResults } from '../extractFileNameFromCwResults.js';

const FILE = 'token-details/20261005/audit.ndjson';

describe('extractFileNameFromCwResults', () => {
  it('extracts the S3 key from a JSON log without appending JSON metadata', () => {
    const message = JSON.stringify({ log: `INFO Getting file ${FILE}`, pod_app: 'interop-be-audit-signer' });
    assert.strictEqual(extractFileNameFromCwResults([[{ field: '@message', value: message }]], '@message'), FILE);
  });

  it('supports plain text, quoted names and JSON escaped newlines', () => {
    for (const message of [
      `INFO Getting file ${FILE} from storage`,
      `INFO Getting file "${FILE}"`,
      JSON.stringify({ log: `INFO Getting file ${FILE}\nNext log line` }),
    ]) {
      assert.strictEqual(extractFileNameFromCwResults([[{ field: '@message', value: message }]], '@message'), FILE);
    }
  });

  it('ignores other fields and metadata and skips rows without a filename', () => {
    const rows = [
      [{ field: 'other', value: `Getting file wrong.ndjson` }],
      [{ field: '@message', value: JSON.stringify({ metadata: 'Getting file wrong.ndjson' }) }],
      [{ field: '@message', value: JSON.stringify({ log: 'Getting file ' }) }],
      [{ field: '@message', value: `Getting file ${FILE}` }],
    ];
    assert.strictEqual(extractFileNameFromCwResults(rows, '@message'), FILE);
    assert.strictEqual(extractFileNameFromCwResults([], '@message'), '');
  });
});
