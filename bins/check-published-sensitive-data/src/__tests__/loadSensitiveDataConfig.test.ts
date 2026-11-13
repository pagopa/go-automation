import assert from 'node:assert/strict';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadSensitiveDataConfig, parseSensitiveDataConfig } from '../loadSensitiveDataConfig.js';

const REPOSITORY_CONFIG = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../published-sensitive-data.config.json',
);

const VALID = {
  allowedAccountIds: [{ value: '000000000000', reason: 'synthetic' }],
  profileNames: [],
  profilePrefixes: ['sso_'],
  forbiddenPathSegments: ['__tests__'],
  forbiddenSuffixes: ['.tsbuildinfo'],
  exceptions: [],
};

describe('loadSensitiveDataConfig', () => {
  it('loads the repository configuration', async () => {
    const config = await loadSensitiveDataConfig(REPOSITORY_CONFIG);
    assert.ok(config.profilePrefixes.includes('sso_'));
    assert.ok(config.forbiddenPathSegments.includes('__baseline__'));
  });

  it('requires a reason for every allowed id and every exception', () => {
    assert.throws(
      () => parseSensitiveDataConfig({ ...VALID, allowedAccountIds: [{ value: '000000000000', reason: ' ' }] }),
      /needs a reason/u,
    );
    assert.throws(
      () =>
        parseSensitiveDataConfig({ ...VALID, exceptions: [{ package: '@pagopa/one', file: 'dist/a.js', value: 'x' }] }),
      /needs a reason/u,
    );
    assert.throws(
      () => parseSensitiveDataConfig({ ...VALID, exceptions: [{ file: 'dist/a.js', value: 'x', reason: 'r' }] }),
      /non-empty package/u,
    );
  });

  it('rejects a malformed list', () => {
    assert.throws(() => parseSensitiveDataConfig({ ...VALID, profilePrefixes: [''] }), /non-empty strings/u);
  });
});
