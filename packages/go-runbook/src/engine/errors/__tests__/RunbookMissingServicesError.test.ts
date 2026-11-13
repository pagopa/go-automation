import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RunbookMissingServicesError } from '../RunbookMissingServicesError.js';

describe('RunbookMissingServicesError', () => {
  it('names the runbook and every missing service', () => {
    const error = new RunbookMissingServicesError('rb', ['athena', 'dynamodb']);

    assert.ok(error instanceof Error);
    assert.strictEqual(error.name, 'RunbookMissingServicesError');
    assert.strictEqual(error.runbookId, 'rb');
    assert.deepStrictEqual(error.missing, ['athena', 'dynamodb']);
    assert.match(error.message, /"rb" requires services that were not provided: athena, dynamodb/u);
  });
});
