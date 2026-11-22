import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createTestContext } from '../../../../__tests__/helpers/createTestContext.js';
import { readNonBlankVar } from '../readNonBlankVar.js';

describe('readNonBlankVar', () => {
  it('trims the value and treats a blank or missing variable as absent', () => {
    const context = createTestContext({ vars: { present: '  value  ', blank: '   ' } });
    assert.equal(readNonBlankVar(context, 'present'), 'value');
    assert.equal(readNonBlankVar(context, 'blank'), undefined);
    assert.equal(readNonBlankVar(context, 'missing'), undefined);
  });
});
