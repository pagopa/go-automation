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

describe('parseRetryAfterMs — the three RFC 9110 grammars', () => {
  // Date.parse reads bare numbers as years, so a malformed numeric header
  // would resolve to a past date and collapse to a zero delay.
  for (const header of ['-5', '+5', '1.5']) {
    it(`does not let Date.parse turn "${header}" into a zero delay`, () => {
      const parsed = parseRetryAfterMs(header, NOW);
      assert.notStrictEqual(parsed, 0, `"${header}" must not collapse to an immediate retry`);
    });
  }

  it('accepts all three formats RFC 9110 admits', () => {
    assert.strictEqual(parseRetryAfterMs('Thu, 01 Jan 2026 00:02:00 GMT', NOW), 120_000, 'IMF-fixdate');
    assert.strictEqual(parseRetryAfterMs('Thursday, 01-Jan-26 00:02:00 GMT', NOW), 120_000, 'RFC 850');
    assert.strictEqual(parseRetryAfterMs('Thu Jan  1 00:02:00 2026', NOW), 120_000, 'asctime');
  });

  it('reads the timezone-less asctime format as GMT, as RFC 9110 §5.6.7 requires', () => {
    // Bare `Date.parse` reads it in host-local time. East of Greenwich that
    // lands the instant in the past, and `Math.max(0, …)` turns a "wait two
    // minutes" into an immediate retry against the server asking us to wait.
    assert.strictEqual(parseRetryAfterMs('Thu Jan  1 00:02:00 2026', NOW), 120_000);
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
