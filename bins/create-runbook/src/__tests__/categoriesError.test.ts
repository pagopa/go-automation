import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { categoriesError } from '../validation/categoriesError.js';

describe('categoriesError', () => {
  it('accepts unique uppercase catalog categories and rejects malformed or duplicate ones', () => {
    assert.strictEqual(categoriesError(['AUTHORIZATION', 'INTEGRATION_2']), undefined);
    assert.match(categoriesError(['delivery']) ?? '', /Categoria non valida/u);
    assert.match(categoriesError(['DELIVERY', 'DELIVERY']) ?? '', /duplicati/u);
  });
});
