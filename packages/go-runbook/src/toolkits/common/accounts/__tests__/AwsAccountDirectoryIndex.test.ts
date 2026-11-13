import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AwsAccountDirectoryIndex } from '../AwsAccountDirectoryIndex.js';
import { ALIAS, CORE, DIRECTORY, EXTRA } from './fixtures.js';

describe('AwsAccountDirectoryIndex', () => {
  const index = new AwsAccountDirectoryIndex(DIRECTORY);

  it('finds the account of a logical account in an environment', () => {
    assert.equal(index.accountIdOf(CORE, 'uat'), '000000000201');
    assert.equal(index.accountIdOf(EXTRA, 'dev'), undefined);
  });

  it('finds the environment of an account, aliases included', () => {
    assert.equal(index.environmentOf('000000000102'), 'prod');
    assert.equal(index.accountIdOf(ALIAS, 'dev'), index.accountIdOf(CORE, 'dev'));
    assert.equal(index.environmentOf('000000000999'), undefined);
  });
});
