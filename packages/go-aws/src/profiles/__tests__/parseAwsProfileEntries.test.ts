import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseAwsProfileEntries } from '../parseAwsProfileEntries.js';

const CORE = 'profile-core';
const CONFINFO = 'profile-confinfo';

describe('parseAwsProfileEntries', () => {
  it('leaves a flat list exactly as it was', () => {
    const parsed = parseAwsProfileEntries([CORE, CONFINFO]);

    // The compatibility guarantee: every script that never writes the compact
    // form keeps the profiles it always had, and declares no fallback.
    assert.deepStrictEqual(parsed.profileNames, [CORE, CONFINFO]);
    assert.strictEqual(parsed.fallbacksByProfile.size, 0);
  });

  it('separates the profile from its declared fallbacks', () => {
    const parsed = parseAwsProfileEntries([CORE, `${CONFINFO}:${CORE}`]);

    assert.deepStrictEqual(parsed.profileNames, [CORE, CONFINFO]);
    assert.deepStrictEqual([...parsed.fallbacksByProfile], [[CONFINFO, [CORE]]]);
  });

  it('accepts account ids and profile names as fallbacks', () => {
    const parsed = parseAwsProfileEntries([`${CONFINFO}:${CORE}|000000000902`]);

    assert.deepStrictEqual(parsed.fallbacksByProfile.get(CONFINFO), [CORE, '000000000902']);
  });

  it('keeps declaration order and never repeats a profile', () => {
    const parsed = parseAwsProfileEntries([`${CONFINFO}:${CORE}`, CONFINFO, `${CONFINFO}:000000000902|${CORE}`]);

    assert.deepStrictEqual(parsed.profileNames, [CONFINFO]);
    assert.deepStrictEqual(parsed.fallbacksByProfile.get(CONFINFO), [CORE, '000000000902']);
  });

  it('ignores blanks and surrounding whitespace', () => {
    const parsed = parseAwsProfileEntries(['  ', '', ` ${CONFINFO} : ${CORE} `]);

    assert.deepStrictEqual(parsed.profileNames, [CONFINFO]);
    assert.deepStrictEqual(parsed.fallbacksByProfile.get(CONFINFO), [CORE]);
  });

  it('rejects a malformed entry instead of ignoring it', () => {
    assert.throws(() => parseAwsProfileEntries([`:${CORE}`]), /profile name is required/);
    assert.throws(() => parseAwsProfileEntries([`${CONFINFO}:`]), /at least one fallback/);
    assert.throws(() => parseAwsProfileEntries([`${CONFINFO}: | `]), /at least one fallback/);
  });

  it('rejects a profile listed as its own fallback', () => {
    assert.throws(() => parseAwsProfileEntries([`${CONFINFO}:${CONFINFO}`]), /cannot be its own fallback/);
  });
});
