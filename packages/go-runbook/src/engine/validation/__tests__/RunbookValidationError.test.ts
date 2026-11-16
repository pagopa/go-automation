import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RunbookValidationError } from '../RunbookValidationError.js';

describe('RunbookValidationError', () => {
  it('lists every validation entry with its code and keeps the entries', () => {
    const errors = [
      { code: 'DUPLICATE_STEP_ID', message: 'step "a" is declared twice', stepId: 'a' },
      { code: 'MISSING_FALLBACK', message: 'no fallback action' },
    ] as const;

    const error = new RunbookValidationError('rb-1', errors);

    assert.ok(error instanceof RunbookValidationError);
    assert.ok(error instanceof Error);
    assert.strictEqual(error.name, 'RunbookValidationError');
    assert.strictEqual(error.runbookId, 'rb-1');
    assert.deepStrictEqual(error.errors, errors);
    assert.strictEqual(
      error.message,
      'Validation failed for runbook "rb-1" (2 errors):\n' +
        '  1. [DUPLICATE_STEP_ID] step "a" is declared twice\n' +
        '  2. [MISSING_FALLBACK] no fallback action',
    );
  });
});
