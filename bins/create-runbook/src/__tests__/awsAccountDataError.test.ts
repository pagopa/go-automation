import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { awsAccountDataError } from '../validation/awsAccountDataError.js';

function file(content: string): { readonly path: string; readonly content: string } {
  return { path: '/repo/inventory/send/service/pn-foo/runbook.ts', content };
}

describe('awsAccountDataError', () => {
  it('accepts a runbook without account data, and the synthetic example ids', () => {
    assert.strictEqual(awsAccountDataError([file("const x = 'pn-foo'; // 000000000000 123456789012")]), undefined);
  });

  it('rejects an account id from the answers, naming the file and the logical accounts', () => {
    const error = awsAccountDataError([file("logGroup: 'arn:aws:logs:eu-south-1:987654321098:log-group:/x'")]);
    assert.match(error ?? '', /runbook\.ts: .*account id.*account logici/u);
  });

  it('rejects an SSO profile name', () => {
    assert.notStrictEqual(awsAccountDataError([file("profile: 'sso_pn-foo-prod'")]), undefined);
  });

  it('ignores 13-digit timestamps', () => {
    assert.strictEqual(awsAccountDataError([file('const firedAt = 1731499200000;')]), undefined);
  });
});
