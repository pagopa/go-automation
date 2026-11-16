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

  it('finds an ARN with an account', () => {
    assert.ok(rulesOf(`"arn:aws:iam::${DECOY_ACCOUNT_ID}:role/x"`).includes('account-arn'));
  });

  it('finds an SSO profile name in a README, a source map and a package.json', () => {
    assert.deepStrictEqual(rulesOf('Run with `--aws-profiles sso_x`.'), ['profile-name']);
    assert.deepStrictEqual(rulesOf('{"sourcesContent":["const p = \\"sso_pn-core\\";"]}'), ['profile-name']);
    assert.deepStrictEqual(rulesOf('{ "description": "uses sso_prod" }'), ['profile-name']);
  });

  it('finds a known profile name as a whole token', () => {
    assert.deepStrictEqual(rulesOf("profile: 'my-known-profile'"), ['profile-name']);
    assert.deepStrictEqual(rulesOf('not-my-known-profile-at-all'), []);
  });
});

describe('scanText — false positives', () => {
  it('accepts the allowlisted synthetic ids, also inside an ARN', () => {
    assert.deepStrictEqual(rulesOf("'000000000000' 'arn:aws:sts::123456789012:assumed-role/x'"), []);
  });

  it('ignores 13-digit timestamps and longer digit runs', () => {
    assert.deepStrictEqual(rulesOf('const firedAt = 1731499200000; const big = 98765432109876;'), []);
  });

  it('ignores query profile ids, alarm and resource names', () => {
    assert.deepStrictEqual(rulesOf("queryProfile: 'interop-one-trust-notices-prod'"), []);
  });

  it('ignores an SSO prefix inside a longer identifier', () => {
    assert.deepStrictEqual(rulesOf('const my_sso_session = 1;'), []);
  });

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
