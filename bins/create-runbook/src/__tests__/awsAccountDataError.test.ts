import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { awsAccountDataError } from '../validation/awsAccountDataError.js';

function file(content: string): { readonly path: string; readonly content: string } {
  return { path: '/repo/inventory/send/service/pn-foo/runbook.ts', content };
}

describe('awsAccountDataError', () => {
  it('accepts a runbook without account data, the synthetic example ids and 13-digit timestamps', () => {
    for (const content of ["const x = 'pn-foo'; // 000000000000 123456789012", 'const firedAt = 1731499200000;']) {
      assert.strictEqual(awsAccountDataError([file(content)]), undefined, content);
    }
  });

  it('rejects an account id, naming the file and the logical accounts, and an SSO profile name', () => {
    const error = awsAccountDataError([file("logGroup: 'arn:aws:logs:eu-south-1:987654321098:log-group:/x'")]);
    assert.match(error ?? '', /runbook\.ts: .*account id.*account logici/u);
    assert.notStrictEqual(awsAccountDataError([file("profile: 'sso_pn-foo-prod'")]), undefined);
  });
});
