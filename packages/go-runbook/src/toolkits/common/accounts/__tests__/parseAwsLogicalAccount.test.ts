import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseAwsLogicalAccount } from '../parseAwsLogicalAccount.js';

describe('parseAwsLogicalAccount', () => {
  it('accepts <product>/<account> in lower case', () => {
    assert.equal(parseAwsLogicalAccount('send/core'), 'send/core');
    assert.equal(parseAwsLogicalAccount('interop/safe-storage'), 'interop/safe-storage');
  });

  it('rejects other forms, including an environment or an account id', () => {
    for (const value of ['send', 'Send/core', 'send/core/prod', 'send/000000000000 ', '', 'send/co re']) {
      assert.throws(() => parseAwsLogicalAccount(value), /Invalid logical AWS account/u, value);
    }
  });
});
