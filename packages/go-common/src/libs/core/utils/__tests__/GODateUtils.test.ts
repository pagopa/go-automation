import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatUtcDateTime } from '../GODateUtils.js';

describe('formatUtcDateTime', () => {
  it('formats ISO strings as dd/MM/yyyy HH.mm.ss', () => {
    assert.strictEqual(formatUtcDateTime('2025-01-15T10:30:45.000Z'), '15/01/2025 10.30.45');
  });

  it('formats Date instances', () => {
    assert.strictEqual(formatUtcDateTime(new Date('2025-06-01T14:05:00.000Z')), '01/06/2025 14.05.00');
  });

  it('pads single-digit components', () => {
    assert.strictEqual(formatUtcDateTime('2025-03-05T09:02:07.000Z'), '05/03/2025 09.02.07');
  });

  it('handles the start and end of a UTC day', () => {
    assert.strictEqual(formatUtcDateTime('2025-12-31T00:00:00.000Z'), '31/12/2025 00.00.00');
    assert.strictEqual(formatUtcDateTime('2025-01-01T23:59:59.000Z'), '01/01/2025 23.59.59');
  });

  it('normalizes timezone offsets to UTC', () => {
    assert.strictEqual(formatUtcDateTime('2025-01-15T23:30:45.000-02:00'), '16/01/2025 01.30.45');
  });

  it('returns Invalid DateTime for invalid values', () => {
    assert.strictEqual(formatUtcDateTime('not-a-date'), 'Invalid DateTime');
  });
});
