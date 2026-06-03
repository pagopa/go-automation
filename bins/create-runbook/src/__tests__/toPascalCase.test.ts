import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { toPascalCase } from '../naming/toPascalCase.js';

describe('toPascalCase', () => {
  it('joins kebab segments preserving inner capitalization', () => {
    assert.strictEqual(toPascalCase('delivery-B2B-ApiGwAlarm'), 'DeliveryB2BApiGwAlarm');
  });

  it('handles mixed separators and collapses repeats', () => {
    assert.strictEqual(toPascalCase('foo_bar  baz'), 'FooBarBaz');
  });

  it('returns an empty string for an empty input', () => {
    assert.strictEqual(toPascalCase(''), '');
  });
});
