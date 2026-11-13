import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { toAwsAccountsConfig } from '../toAwsAccountsConfig.js';

describe('toAwsAccountsConfig', () => {
  it('uses the default binding and drops blank values', () => {
    assert.deepEqual(
      toAwsAccountsConfig({
        directory: [' shop/core/prod=000000000101 ', ''],
        environment: ' ',
        permissionSets: ['', 'ReadOnly'],
        region: 'eu-south-1',
        defaultBinding: 'profiles',
      }),
      {
        directory: ['shop/core/prod=000000000101'],
        binding: 'profiles',
        region: 'eu-south-1',
        permissionSets: ['ReadOnly'],
      },
    );
  });

  it('keeps an explicit binding and environment, and rejects an unknown binding', () => {
    const config = toAwsAccountsConfig({
      binding: 'oam',
      environment: 'uat',
      region: 'eu-south-1',
      defaultBinding: 'profiles',
    });
    assert.equal(config.binding, 'oam');
    assert.equal(config.environment, 'uat');
    assert.deepEqual(config.directory, []);
    assert.throws(
      () => toAwsAccountsConfig({ binding: 'sso', region: 'eu-south-1', defaultBinding: 'profiles' }),
      /Invalid aws.account.binding "sso"/u,
    );
  });
});
