/**
 * Tests for GODateInput
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { describeDateInputFormats, parseDateInput, tryParseDateInput } from '../GODateInput.js';

/** Fixed reference instant, so relative inputs are deterministic. */
const NOW = new Date('2026-08-24T10:00:00.000Z');

/** Parses with the fixed reference instant and returns the ISO result. */
function iso(input: string, options: { timeZone?: string; boundary?: 'start' | 'end' } = {}): string {
  return parseDateInput(input, { now: NOW, ...options }).iso;
}

describe('parseDateInput', () => {
  it('resolves the now keywords to the reference instant', () => {
    assert.strictEqual(iso('now'), '2026-08-24T10:00:00.000Z');
    assert.strictEqual(iso('  ADESSO  '), '2026-08-24T10:00:00.000Z');
  });

  it('resolves day keywords to the requested edge of the day', () => {
    assert.strictEqual(iso('today'), '2026-08-24T00:00:00.000Z');
    assert.strictEqual(iso('oggi', { boundary: 'end' }), '2026-08-24T23:59:59.999Z');
    assert.strictEqual(iso('ieri'), '2026-08-23T00:00:00.000Z');
    assert.strictEqual(iso('yesterday', { boundary: 'end' }), '2026-08-23T23:59:59.999Z');
  });

  it('resolves signed offsets from the reference instant', () => {
    assert.strictEqual(iso('-7d'), '2026-08-17T10:00:00.000Z');
    assert.strictEqual(iso('-24h'), '2026-08-23T10:00:00.000Z');
    assert.strictEqual(iso('-30m'), '2026-08-24T09:30:00.000Z');
    assert.strictEqual(iso('-2w'), '2026-08-10T10:00:00.000Z');
    assert.strictEqual(iso('+1d'), '2026-08-25T10:00:00.000Z');
    assert.strictEqual(iso('-7 d'), '2026-08-17T10:00:00.000Z');
  });

  it('resolves a calendar day to the requested edge of the day', () => {
    assert.strictEqual(iso('2026-08-24'), '2026-08-24T00:00:00.000Z');
    assert.strictEqual(iso('2026-08-24', { boundary: 'end' }), '2026-08-24T23:59:59.999Z');
  });

  it('reads a slash-separated day as day-first, not month-first', () => {
    assert.strictEqual(iso('24/08/2026'), '2026-08-24T00:00:00.000Z');
    assert.strictEqual(iso('03/04/2026'), '2026-04-03T00:00:00.000Z');
    assert.strictEqual(iso('3/4/2026', { boundary: 'end' }), '2026-04-03T23:59:59.999Z');
  });

  it('resolves a day-first date carrying a time of day', () => {
    assert.strictEqual(iso('24/08/2026 14:30'), '2026-08-24T14:30:00.000Z');
    assert.strictEqual(iso('24/08/2026 14:30:15'), '2026-08-24T14:30:15.000Z');
  });

  it('keeps understanding what GODateTokens already accepted', () => {
    assert.strictEqual(iso('2026-08-24T14:30:00Z'), '2026-08-24T14:30:00.000Z');
    assert.strictEqual(iso('2026-08-24 14:30:00'), '2026-08-24T14:30:00.000Z');
    assert.strictEqual(iso('1756000000'), new Date(1_756_000_000_000).toISOString());
    assert.strictEqual(iso('1756000000000'), new Date(1_756_000_000_000).toISOString());
  });

  it('resolves day boundaries in the requested time zone', () => {
    assert.strictEqual(iso('2026-08-24', { timeZone: 'Europe/Rome' }), '2026-08-23T22:00:00.000Z');
    assert.strictEqual(iso('2026-08-24', { timeZone: 'Europe/Rome', boundary: 'end' }), '2026-08-24T21:59:59.999Z');
    assert.strictEqual(iso('oggi', { timeZone: 'Europe/Rome' }), '2026-08-23T22:00:00.000Z');
  });

  it('leaves an explicit offset alone, whatever the time zone option says', () => {
    assert.strictEqual(iso('2026-08-24T14:30:00Z', { timeZone: 'Europe/Rome' }), '2026-08-24T14:30:00.000Z');
  });

  it('returns the parsed date alongside its ISO form', () => {
    const result = parseDateInput('-7d', { now: NOW });
    assert.ok(result.date instanceof Date);
    assert.strictEqual(result.date.toISOString(), result.iso);
  });

  it('rejects empty input', () => {
    assert.throws(() => parseDateInput('   ', { now: NOW }), /cannot be empty/);
  });

  it('rejects an unknown time zone', () => {
    assert.throws(() => parseDateInput('now', { now: NOW, timeZone: 'Mars/Olympus' }), /Invalid timezone/);
  });

  it('rejects input no format matches', () => {
    assert.throws(() => parseDateInput('domani', { now: NOW }), /Invalid date value/);
    assert.throws(() => parseDateInput('31/02/2026', { now: NOW }), /Invalid date value/);
    assert.throws(() => parseDateInput('yesterday morning', { now: NOW }), /Invalid date value/);
  });
});

describe('tryParseDateInput', () => {
  it('returns the result for valid input', () => {
    assert.strictEqual(tryParseDateInput('-7d', { now: NOW })?.iso, '2026-08-17T10:00:00.000Z');
  });

  it('returns undefined instead of throwing', () => {
    assert.strictEqual(tryParseDateInput('domani', { now: NOW }), undefined);
    assert.strictEqual(tryParseDateInput('', { now: NOW }), undefined);
  });
});

describe('describeDateInputFormats', () => {
  it('lists formats the parser actually accepts', () => {
    const described = describeDateInputFormats();
    for (const sample of ['2026-08-24', '24/08/2026 14:30', '-7d', 'now']) {
      assert.ok(described.includes(sample), `missing ${sample}`);
      assert.ok(tryParseDateInput(sample, { now: NOW }) !== undefined, `unparseable ${sample}`);
    }
  });
});
