import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { JiraAuthBuilder } from '../jira/JiraAuthBuilder.js';
import { JiraAuthMode } from '../types/JiraAuthMode.js';

describe('JiraAuthBuilder', () => {
  it('builds a Basic header from email + token', () => {
    const header = JiraAuthBuilder.build({
      authMode: JiraAuthMode.BASIC,
      email: 'user@example.com',
      token: 'secret',
    });
    const expected = `Basic ${Buffer.from('user@example.com:secret').toString('base64')}`;
    assert.strictEqual(header, expected);
  });

  it('builds a Bearer header in bearer mode', () => {
    const header = JiraAuthBuilder.build({
      authMode: JiraAuthMode.BEARER,
      email: 'unused',
      token: 'pat-token',
    });
    assert.strictEqual(header, 'Bearer pat-token');
  });

  it('throws if the token is empty', () => {
    assert.throws(() => JiraAuthBuilder.build({ authMode: JiraAuthMode.BASIC, email: 'x@y.z', token: '' }), /not set/);
  });

  it('throws on missing email in basic mode', () => {
    assert.throws(
      () => JiraAuthBuilder.build({ authMode: JiraAuthMode.BASIC, email: '', token: 'secret' }),
      /requires --jira-email/,
    );
  });
});
