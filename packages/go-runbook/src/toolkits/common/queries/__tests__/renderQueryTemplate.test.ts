import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { renderQueryTemplate } from '../renderQueryTemplate.js';

describe('renderQueryTemplate', () => {
  it('substitutes every occurrence of each placeholder, leaving a template without values untouched', () => {
    assert.strictEqual(
      renderQueryTemplate('a >= {{x}} or b >= {{x}} or c >= {{y}}', { values: { '{{x}}': '7', '{{y}}': '8' } }),
      'a >= 7 or b >= 7 or c >= 8',
    );
    assert.strictEqual(renderQueryTemplate('literal template', { values: {} }), 'literal template');
  });

  it('treats every key of `values` as required, naming the queryId in the error when provided', () => {
    assert.throws(
      () => renderQueryTemplate('no placeholder here', { values: { '{{X}}': 'v' }, queryId: 'profile.accessLog' }),
      /renderQueryTemplate \("profile\.accessLog"\): template is missing required placeholder "\{\{X\}\}"/,
    );
    assert.throws(
      () => renderQueryTemplate('x', { values: { '{{NOPE}}': 'v' } }),
      /renderQueryTemplate: template is missing required placeholder/,
    );
  });

  it('skips the required check for keys listed in `optional`', () => {
    const result = renderQueryTemplate('no placeholder here', {
      values: { '{{OPTIONAL}}': 'never-used' },
      optional: ['{{OPTIONAL}}'],
    });
    assert.strictEqual(result, 'no placeholder here');
  });

  it('escapes values (quotes and null bytes) only with escape: "sql"', () => {
    const template = "filter @message like '{{VALUE}}'";
    assert.strictEqual(
      renderQueryTemplate(template, { values: { '{{VALUE}}': "O'Bri\0en" }, escape: 'sql' }),
      "filter @message like 'O''Brien'",
    );
    assert.strictEqual(
      renderQueryTemplate(template, { values: { '{{VALUE}}': "O'Brien" } }),
      "filter @message like 'O'Brien'",
    );
  });
});
