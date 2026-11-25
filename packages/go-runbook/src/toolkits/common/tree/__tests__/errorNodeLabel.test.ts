import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { errorNodeLabel } from '../errorNodeLabel.js';

describe('errorNodeLabel', () => {
  it('keeps the first line of the message, bounded, or the fallback', () => {
    assert.strictEqual(errorNodeLabel('TimeoutError: read timed out\n    at Socket'), 'TimeoutError: read timed out');
    assert.ok(errorNodeLabel('x'.repeat(500)).length <= 160);
    assert.strictEqual(errorNodeLabel(''), 'errore senza messaggio');
    assert.strictEqual(errorNodeLabel('', 'invocazione in errore'), 'invocazione in errore');
  });
});
