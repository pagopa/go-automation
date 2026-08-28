import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseRetryAfterMs } from '../GORetryAfter.js';

/** Fixed reference instant so the HTTP-date cases are deterministic. */
const NOW = Date.parse('2026-01-01T00:00:00.000Z');

describe('parseRetryAfterMs — delay-seconds', () => {
  it('converts a digit run to milliseconds', () => {
    assert.strictEqual(parseRetryAfterMs('120', NOW), 120_000);
    assert.strictEqual(parseRetryAfterMs('1', NOW), 1_000);
  });

  it('accepts zero, which means "retry immediately"', () => {
    assert.strictEqual(parseRetryAfterMs('0', NOW), 0);
  });

  it('tolerates surrounding whitespace', () => {
    assert.strictEqual(parseRetryAfterMs('  30  ', NOW), 30_000);
  });

  it('reads a year-looking digit run as seconds, per the grammar', () => {
    // "2026" is a conforming delay-seconds. It must never reach the date
    // branch, where Date.parse would read it as the year 2026.
    assert.strictEqual(parseRetryAfterMs('2026', NOW), 2_026_000);
  });

  it('rejects a digit run long enough to overflow to Infinity', () => {
    assert.strictEqual(parseRetryAfterMs('9'.repeat(400), NOW), undefined);
  });
});

describe('parseRetryAfterMs — HTTP-date', () => {
  it('returns the distance to a future date', () => {
    assert.strictEqual(parseRetryAfterMs('Thu, 01 Jan 2026 00:02:00 GMT', NOW), 120_000);
  });

  it('clamps a past date to zero rather than returning a negative delay', () => {
    assert.strictEqual(parseRetryAfterMs('Wed, 21 Oct 2015 07:28:00 GMT', NOW), 0);
  });
});

describe('parseRetryAfterMs — absent header', () => {
  it('reports null, undefined and blank values as absent', () => {
    assert.strictEqual(parseRetryAfterMs(null, NOW), undefined);
    assert.strictEqual(parseRetryAfterMs(undefined, NOW), undefined);
    assert.strictEqual(parseRetryAfterMs('', NOW), undefined);
    assert.strictEqual(parseRetryAfterMs('   ', NOW), undefined);
  });
});

describe('parseRetryAfterMs — malformed values', () => {
  // Each case below is one where the two former implementations disagreed, or
  // where at least one of them produced a delay the grammar does not allow.
  const cases: ReadonlyArray<readonly [header: string, why: string]> = [
    ['1.5', 'fractional seconds: was 1000ms via parseInt, 1500ms via Number'],
    ['120abc', 'trailing garbage: was 120000ms via parseInt prefix parsing'],
    ['0x10', 'hex literal: was 0ms via parseInt, 16000ms via Number'],
    ['+5', 'signed: not permitted by 1*DIGIT'],
    ['-5', 'negative delay'],
    ['soon', 'neither a delay nor a date'],
    ['NaN', 'literal NaN'],
    ['Infinity', 'literal Infinity'],
  ];

  for (const [header, why] of cases) {
    it(`rejects "${header}" (${why})`, () => {
      assert.strictEqual(parseRetryAfterMs(header, NOW), undefined);
    });
  }
});

describe('parseRetryAfterMs — no implicit cap', () => {
  it('returns the full delay and leaves the ceiling to the caller', () => {
    // GOHttpClient bounds this with maxRetryAfterMs; baking a cap into the
    // parser would silently disagree with whatever the caller decided.
    assert.strictEqual(parseRetryAfterMs('86400', NOW), 86_400_000);
  });
});

describe('parseRetryAfterMs — Date.parse leniency', () => {
  // Date.parse reads bare numbers as years, so a malformed numeric header
  // would resolve to a past date and collapse to a zero delay. Guarding the
  // date branch on a leading letter is what keeps these undefined.
  for (const header of ['-5', '+5', '1.5']) {
    it(`does not let Date.parse turn "${header}" into a zero delay`, () => {
      const parsed = parseRetryAfterMs(header, NOW);
      assert.notStrictEqual(parsed, 0, `"${header}" must not collapse to an immediate retry`);
    });
  }

  it('still accepts the timezone-qualified date formats RFC 9110 admits', () => {
    assert.strictEqual(parseRetryAfterMs('Thu, 01 Jan 2026 00:02:00 GMT', NOW), 120_000);
    assert.strictEqual(parseRetryAfterMs('Thursday, 01-Jan-26 00:02:00 GMT', NOW), 120_000);
  });

  it('accepts the asctime format, whose instant Date.parse reads as local time', () => {
    // asctime carries no timezone, so the resolved instant shifts with the
    // host offset. Both former implementations had the same behaviour: they
    // called bare Date.parse too. Assert it parses, not what it resolves to.
    assert.notStrictEqual(parseRetryAfterMs('Thu Jan  1 00:02:00 2026', NOW), undefined);
  });
});
