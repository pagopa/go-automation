import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { renderTemplate } from '../generate/renderTemplate.js';

describe('renderTemplate', () => {
  it('replaces every occurrence of a known token, also with an empty value, leaving unknown tokens untouched', () => {
    const tokens = new Map<string, string>([
      ['RUNBOOK_ID', 'pn-foo'],
      ['AUTHORIZER_BLOCK', ''],
    ]);
    assert.strictEqual(
      renderTemplate('id={{RUNBOOK_ID}} again={{RUNBOOK_ID}}{{AUTHORIZER_BLOCK}} {{MISSING}}', tokens),
      'id=pn-foo again=pn-foo {{MISSING}}',
    );
  });
});
