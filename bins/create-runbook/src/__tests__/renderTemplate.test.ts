import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { renderTemplate } from '../generate/renderTemplate.js';

describe('renderTemplate', () => {
  it('replaces every occurrence of a known token', () => {
    const tokens = new Map<string, string>([['RUNBOOK_ID', 'pn-foo']]);
    assert.strictEqual(renderTemplate('id={{RUNBOOK_ID}} again={{RUNBOOK_ID}}', tokens), 'id=pn-foo again=pn-foo');
  });

  it('leaves unknown tokens untouched', () => {
    const tokens = new Map<string, string>([['KNOWN', 'x']]);
    assert.strictEqual(renderTemplate('{{KNOWN}}-{{MISSING}}', tokens), 'x-{{MISSING}}');
  });

  it('supports empty replacement values', () => {
    const tokens = new Map<string, string>([['AUTHORIZER_BLOCK', '']]);
    assert.strictEqual(renderTemplate('{{AUTHORIZER_BLOCK}}end', tokens), 'end');
  });
});
