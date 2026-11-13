import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatFinding } from '../formatFinding.js';
import { DECOY_ACCOUNT_ID } from './fixtures.js';

describe('formatFinding', () => {
  it('never prints the value it found', () => {
    const lines = [
      formatFinding('pkg', { file: 'dist/a.js', line: 3, rule: 'account-id', value: DECOY_ACCOUNT_ID }),
      formatFinding('pkg', {
        file: 'dist/a.js',
        line: 4,
        rule: 'account-arn',
        value: `arn:aws:iam::${DECOY_ACCOUNT_ID}:`,
      }),
      formatFinding('pkg', { file: 'README.md', line: 1, rule: 'profile-name', value: 'sso_secret-profile' }),
    ];
    assert.ok(lines.every((line) => !line.includes(DECOY_ACCOUNT_ID) && !line.includes('secret-profile')));
    assert.strictEqual(lines[0], 'pkg dist/a.js:3 [account-id] 987…98');
  });

  it('never prints a short profile name whole', () => {
    for (const value of ['p', 'qa', 'dev', 'prod']) {
      const line = formatFinding('pkg', { file: 'README.md', line: 1, rule: 'profile-name', value });
      assert.ok(!line.endsWith(` ${value}…`) && !line.includes(`] ${value}`), line);
    }
  });

  it('names a forbidden entry without a line', () => {
    assert.strictEqual(
      formatFinding('pkg', {
        file: 'dist/x.tsbuildinfo',
        line: 0,
        rule: 'forbidden-entry',
        value: 'dist/x.tsbuildinfo',
      }),
      'pkg dist/x.tsbuildinfo [forbidden-entry] must not be published',
    );
  });
});
