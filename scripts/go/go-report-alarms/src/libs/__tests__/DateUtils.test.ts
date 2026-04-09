/**
 * Tests for DateUtils
 *
 * Verifies Google Sheets timestamp formatting from various date inputs.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { googleSheetTimestamp } from '../DateUtils.js';

describe('DateUtils', () => {
  describe('googleSheetTimestamp', () => {
    it('formats ISO string to dd/MM/yyyy HH.mm.ss', () => {
      const result = googleSheetTimestamp('2025-01-15T10:30:45.000Z');
      assert.strictEqual(result, '15/01/2025 10.30.45');
    });

    it('formats Date object', () => {
      const result = googleSheetTimestamp(new Date('2025-06-01T14:05:00.000Z'));
      assert.strictEqual(result, '01/06/2025 14.05.00');
    });

    it('pads single-digit day and month', () => {
      const result = googleSheetTimestamp('2025-03-05T09:02:07.000Z');
      assert.strictEqual(result, '05/03/2025 09.02.07');
    });

    it('handles midnight', () => {
      const result = googleSheetTimestamp('2025-12-31T00:00:00.000Z');
      assert.strictEqual(result, '31/12/2025 00.00.00');
    });

    it('handles end of day', () => {
      const result = googleSheetTimestamp('2025-01-01T23:59:59.000Z');
      assert.strictEqual(result, '01/01/2025 23.59.59');
    });
  });
});
