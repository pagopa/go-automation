import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileScanRules, scanText } from '../scanText.js';
import { CONFIG, DECOY_ACCOUNT_ID } from './fixtures.js';

const RULES = compileScanRules(CONFIG, '@pagopa/one');

function rulesOf(text: string): ReadonlyArray<string> {
  return scanText('dist/index.js', text, RULES).map((finding) => finding.rule);
}

describe('scanText — positives', () => {
  it('finds a non-synthetic account id, with its line', () => {
    const findings = scanText('dist/index.js', `const a = 1;\nconst id = '${DECOY_ACCOUNT_ID}';`, RULES);
    assert.deepStrictEqual(
      findings.map(({ line, rule }) => ({ line, rule })),
      [{ line: 2, rule: 'account-id' }],
    );
  });

  const positives: ReadonlyArray<readonly [string, string, ReadonlyArray<string>]> = [
    ['an ARN with an account', `"arn:aws:iam::${DECOY_ACCOUNT_ID}:role/x"`, ['account-id', 'account-arn']],
    ['an SSO profile name in a README', 'Run with `--aws-profiles sso_x`.', ['profile-name']],
    ['an SSO profile name in a source map', '{"sourcesContent":["const p = \\"sso_pn-core\\";"]}', ['profile-name']],
    ['an SSO profile name in a package.json', '{ "description": "uses sso_prod" }', ['profile-name']],
    ['a known profile name as a whole token', "profile: 'my-known-profile'", ['profile-name']],
  ];

  for (const [name, text, expected] of positives) {
    it(`finds ${name}`, () => {
      assert.deepStrictEqual(rulesOf(text), expected);
    });
  }
});

describe('scanText — false positives', () => {
  const negatives: ReadonlyArray<readonly [string, string]> = [
    ['the allowlisted synthetic ids, also inside an ARN', "'000000000000' 'arn:aws:sts::123456789012:assumed-role/x'"],
    ['13-digit timestamps and longer digit runs', 'const firedAt = 1731499200000; const big = 98765432109876;'],
    ['query profile ids, alarm and resource names', "queryProfile: 'interop-one-trust-notices-prod'"],
    ['an SSO prefix inside a longer identifier', 'const my_sso_session = 1;'],
    ['a known profile name inside a longer token', 'not-my-known-profile-at-all'],
  ];

  for (const [name, text] of negatives) {
    it(`accepts ${name}`, () => {
      assert.deepStrictEqual(rulesOf(text), []);
    });
  }

  it('accepts a reasoned exception for that package, file and value only', () => {
    const config = {
      ...CONFIG,
      exceptions: [{ package: '@pagopa/one', file: 'README.md', value: DECOY_ACCOUNT_ID, reason: 'test' }],
    };
    const one = compileScanRules(config, '@pagopa/one');
    const other = compileScanRules(config, '@pagopa/other');
    assert.deepStrictEqual(scanText('README.md', DECOY_ACCOUNT_ID, one), []);
    assert.strictEqual(scanText('dist/other.js', DECOY_ACCOUNT_ID, one).length, 1);
    // Same relative path and value in another package: the exception does not cross packages.
    assert.strictEqual(scanText('README.md', DECOY_ACCOUNT_ID, other).length, 1);
  });
});
