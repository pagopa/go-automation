import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { categoriesError } from '../validation/categoriesError.js';

describe('categoriesError', () => {
  it('accepts unique uppercase catalog categories', () => {
    assert.strictEqual(categoriesError(['AUTHORIZATION', 'INTEGRATION_2']), undefined);
  });

  it('rejects malformed categories', () => {
    assert.match(categoriesError(['delivery']) ?? '', /Categoria non valida/u);
  });

  it('rejects duplicate categories', () => {
    assert.match(categoriesError(['DELIVERY', 'DELIVERY']) ?? '', /duplicati/u);
  });
});
