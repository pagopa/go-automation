import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseRetryAfterMs } from '../GORetryAfter.js';

/** Fixed reference instant so the HTTP-date cases are deterministic. */
const NOW = Date.parse('2026-01-01T00:00:00.000Z');

describe('parseRetryAfterMs — delay-seconds', () => {
  const cases: ReadonlyArray<readonly [header: string, expected: number]> = [
    ['120', 120_000],
    ['0', 0], // "retry immediately"
    ['  30  ', 30_000], // surrounding whitespace
    // A conforming delay-seconds: it must never reach the date branch, where
    // Date.parse would read it as the year 2026.
    ['2026', 2_026_000],
    // No implicit cap: GOHttpClient bounds this with maxRetryAfterMs.
    ['86400', 86_400_000],
  ];
  it('converts a digit run to milliseconds', () => {
    for (const [header, expected] of cases) {
      assert.strictEqual(parseRetryAfterMs(header, NOW), expected, header);
    }
  });

  it('rejects a digit run long enough to overflow to Infinity', () => {
    assert.strictEqual(parseRetryAfterMs('9'.repeat(400), NOW), undefined);
  });
});

describe('parseRetryAfterMs — HTTP-date', () => {
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

  it('rejects values the grammar does not allow', () => {
    for (const [header, why] of cases) {
      assert.strictEqual(parseRetryAfterMs(header, NOW), undefined, `"${header}": ${why}`);
    }
  });
});

describe('parseRetryAfterMs — the three RFC 9110 grammars', () => {
  it('accepts all three formats RFC 9110 admits', () => {
    assert.strictEqual(parseRetryAfterMs('Thu, 01 Jan 2026 00:02:00 GMT', NOW), 120_000, 'IMF-fixdate');
    assert.strictEqual(parseRetryAfterMs('Thursday, 01-Jan-26 00:02:00 GMT', NOW), 120_000, 'RFC 850');
    // asctime has no zone and must be read as GMT (RFC 9110 §5.6.7): bare
    // `Date.parse` reads it in host-local time, which east of Greenwich lands
    // in the past and turns "wait two minutes" into an immediate retry.
    assert.strictEqual(parseRetryAfterMs('Thu Jan  1 00:02:00 2026', NOW), 120_000, 'asctime');
  });

  it('rejects a date that only looks like one to Date.parse', () => {
    // These passed the former leading-letter test and resolved to delays of
    // years, which `GOFileDownloader` would have honoured uncapped.
    for (const header of ['January 1, 2030', 'Mar 2027', '2026-01-01T00:02:00Z', 'Tue Dec 2026']) {
      assert.strictEqual(parseRetryAfterMs(header, NOW), undefined, header);
    }
  });

  it('rejects an HTTP-date with the right shape but impossible fields', () => {
    for (const header of [
      'Thu, 32 Jan 2026 00:02:00 GMT',
      'Thu, 01 Foo 2026 00:02:00 GMT',
      'Xyz, 01 Jan 2026 00:02:00 GMT',
      'Thu, 01 Jan 2026 24:02:00 GMT',
    ]) {
      assert.strictEqual(parseRetryAfterMs(header, NOW), undefined, header);
    }
  });

  it("resolves RFC 850's two-digit year in a window rolling with now", () => {
    // `Date.parse` pivots at a fixed year: it reads `-50` as 1950 whatever the
    // current date, so this deadline collapsed to an immediate retry.
    assert.strictEqual(
      parseRetryAfterMs('Sunday, 06-Nov-50 08:49:37 GMT', NOW),
      Date.parse('2050-11-06T08:49:37.000Z') - NOW,
    );
  });

  it('reads a year more than 50 ahead as the same digits in the past century', () => {
    // RFC 9110 §5.6.7: from 2026, `-77` is 1977, not 2077 — long past, so the
    // delay clamps to zero instead of stretching half a century out.
    assert.strictEqual(parseRetryAfterMs('Sunday, 06-Nov-77 08:49:37 GMT', NOW), 0);
    // 2076 is exactly 50 years ahead, the last year still inside the window.
    assert.strictEqual(
      parseRetryAfterMs('Sunday, 06-Nov-76 08:49:37 GMT', NOW),
      Date.parse('2076-11-06T08:49:37.000Z') - NOW,
    );
  });

  it('anchors the window on now rather than on a fixed century', () => {
    const farFuture = Date.parse('2140-01-01T00:00:00.000Z');
    assert.strictEqual(
      parseRetryAfterMs('Sunday, 06-Nov-45 08:49:37 GMT', farFuture),
      Date.parse('2145-11-06T08:49:37.000Z') - farFuture,
    );
  });

  it('crosses the century boundary instead of reaching a hundred years back', () => {
    // RFC 9110 §5.6.7 asks for the most recent year ending in those digits that
    // is not more than 50 years ahead. Anchoring on the current century read
    // `-00` from 2099 as 2000 — 99 years past — and clamped a deadline one year
    // away to an immediate retry.
    const endOfCentury = Date.parse('2099-06-01T00:00:00.000Z');
    assert.strictEqual(
      parseRetryAfterMs('Saturday, 06-Nov-00 08:49:37 GMT', endOfCentury),
      Date.parse('2100-11-06T08:49:37.000Z') - endOfCentury,
    );
    // 2149 is exactly 50 years ahead and still inside the window; 2150 is not,
    // so `-50` falls back to the same digits in the past.
    assert.strictEqual(
      parseRetryAfterMs('Saturday, 06-Nov-49 08:49:37 GMT', endOfCentury),
      Date.parse('2149-11-06T08:49:37.000Z') - endOfCentury,
    );
    assert.strictEqual(parseRetryAfterMs('Saturday, 06-Nov-50 08:49:37 GMT', endOfCentury), 0);
  });

  it('still rejects an RFC 850 date with impossible fields', () => {
    // The two-digit year is rewritten before parsing; that must not smuggle
    // past the field validation `Date.parse` was doing.
    for (const header of [
      'Thursday, 32-Jan-26 00:02:00 GMT',
      'Thursday, 01-Foo-26 00:02:00 GMT',
      'Xyzday, 01-Jan-26 00:02:00 GMT',
    ]) {
      assert.strictEqual(parseRetryAfterMs(header, NOW), undefined, header);
    }
  });

  it('requires the GMT zone the grammar mandates', () => {
    assert.strictEqual(parseRetryAfterMs('Thu, 01 Jan 2026 00:02:00', NOW), undefined);
    assert.strictEqual(parseRetryAfterMs('Thu, 01 Jan 2026 00:02:00 UTC', NOW), undefined);
    assert.strictEqual(parseRetryAfterMs('Thu, 01 Jan 2026 00:02:00 +0100', NOW), undefined);
  });
});
