import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { profileForAccount } from '../libs/profileForAccount.js';

const PROFILES = ['send-core-test', 'send-confinfo-test'];

describe('profileForAccount', () => {
  it('picks the profile carrying the marker', () => {
    assert.strictEqual(profileForAccount(PROFILES, 'confinfo'), 'send-confinfo-test');
  });

  it('refuses to guess when no profile matches', () => {
    // Falling back to the first profile would read the wrong account and
    // report its answer as this account's.
    assert.throws(() => profileForAccount(['send-core-test'], 'confinfo'), /names the 'confinfo' account/);
  });

  it('refuses to guess when more than one matches', () => {
    assert.throws(
      () => profileForAccount(['send-core-test', 'send-core-uat'], 'core'),
      /More than one profile names the 'core' account/,
    );
  });
});
