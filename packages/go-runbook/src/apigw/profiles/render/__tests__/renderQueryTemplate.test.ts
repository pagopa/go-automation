import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { renderQueryTemplate } from '../renderQueryTemplate.js';

describe('renderQueryTemplate', () => {
  it('substitutes a single placeholder', () => {
    const result = renderQueryTemplate('filter status >= {{minStatusCode}}', {
      values: { '{{minStatusCode}}': '500' },
    });
    assert.strictEqual(result, 'filter status >= 500');
  });

  it('substitutes multiple occurrences of the same placeholder', () => {
    const result = renderQueryTemplate('a >= {{x}} or b >= {{x}} or c >= {{x}}', { values: { '{{x}}': '7' } });
    assert.strictEqual(result, 'a >= 7 or b >= 7 or c >= 7');
  });

  it('treats every key of `values` as required by default and throws on missing', () => {
    assert.throws(
      () =>
        renderQueryTemplate('no placeholder here', {
          values: { '{{X}}': 'v' },
          queryId: 'test',
        }),
      /missing required placeholder "\{\{X\}\}"/,
    );
  });

  it('includes the queryId in the error message when provided', () => {
    assert.throws(
      () =>
        renderQueryTemplate('no placeholder here', {
          values: { '{{X}}': 'v' },
          queryId: 'profile.accessLog',
        }),
      /"profile\.accessLog"/,
    );
  });

  it('skips the required check for keys listed in `optional`', () => {
    const result = renderQueryTemplate('no placeholder here', {
      values: { '{{OPTIONAL}}': 'never-used' },
      optional: ['{{OPTIONAL}}'],
    });
    assert.strictEqual(result, 'no placeholder here');
  });

  it('applies SQL escape to values when escape: "sql"', () => {
    const result = renderQueryTemplate("filter @message like '{{VALUE}}'", {
      values: { '{{VALUE}}': "O'Brien" },
      escape: 'sql',
    });
    assert.strictEqual(result, "filter @message like 'O''Brien'");
  });

  it('does not escape when escape is omitted (default: none)', () => {
    const result = renderQueryTemplate("filter @message like '{{VALUE}}'", {
      values: { '{{VALUE}}': "O'Brien" },
    });
    assert.strictEqual(result, "filter @message like 'O'Brien'");
  });

  it('strips null bytes when escape: "sql"', () => {
    const result = renderQueryTemplate("filter @message like '{{VALUE}}'", {
      values: { '{{VALUE}}': 'a\0b' },
      escape: 'sql',
    });
    assert.strictEqual(result, "filter @message like 'ab'");
  });

  it('handles an empty values map without throwing', () => {
    const result = renderQueryTemplate('literal template', { values: {} });
    assert.strictEqual(result, 'literal template');
  });

  it('renders without queryId in the error when not provided', () => {
    assert.throws(
      () => renderQueryTemplate('x', { values: { '{{NOPE}}': 'v' } }),
      /renderQueryTemplate: template is missing required placeholder/,
    );
  });
});
