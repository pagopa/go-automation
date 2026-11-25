import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseAwsAccountDirectory } from '../parseAwsAccountDirectory.js';

describe('parseAwsAccountDirectory', () => {
  it('parses entries in order, ignoring blanks and spaces around "="', () => {
    assert.deepEqual(
      parseAwsAccountDirectory(['send/core/uat=000000000001', '  ', ' send/confinfo/uat = 000000000002 ']),
      [
        { logicalAccount: 'send/core', environment: 'uat', accountId: '000000000001' },
        { logicalAccount: 'send/confinfo', environment: 'uat', accountId: '000000000002' },
      ],
    );
  });

  it('accepts aliases: one account serving two logical accounts of the same environment', () => {
    const parsed = parseAwsAccountDirectory(['send/core/dev=000000000001', 'send/legacy/dev=000000000001']);
    assert.equal(parsed.length, 2);
  });

  it('rejects malformed entries', () => {
    for (const entry of [
      'send/core=000000000001',
      'send/core/uat',
      'send/core/uat=12345',
      'Send/core/uat=000000000001',
      'send/core/uat=0000000000012',
      'send/core/u at=000000000001',
    ]) {
      assert.throws(() => parseAwsAccountDirectory([entry]), /Invalid AWS account directory entry/u, entry);
    }
  });

  it('rejects a logical account declared twice in the same environment', () => {
    assert.throws(
      () => parseAwsAccountDirectory(['send/core/uat=000000000001', 'send/core/uat=000000000002']),
      /declares send\/core\/uat more than once/u,
    );
  });

  it('rejects an account id used in two environments', () => {
    assert.throws(
      () => parseAwsAccountDirectory(['send/core/uat=000000000001', 'send/core/prod=000000000001']),
      /to environments uat and prod/u,
    );
  });
});
