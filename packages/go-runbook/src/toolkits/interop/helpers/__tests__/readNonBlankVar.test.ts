import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createTestContext } from '../../../../__tests__/helpers/createTestContext.js';
import { interopLogsQueryOptions } from '../interopLogsQueryOptions.js';
import { readNonBlankVar } from '../readNonBlankVar.js';

describe('readNonBlankVar', () => {
  it('trims the value and treats a blank or missing variable as absent', () => {
    const context = createTestContext({ vars: { present: '  value  ', blank: '   ' } });
    assert.equal(readNonBlankVar(context, 'present'), 'value');
    assert.equal(readNonBlankVar(context, 'blank'), undefined);
    assert.equal(readNonBlankVar(context, 'missing'), undefined);
  });
});

describe('interopLogsQueryOptions', () => {
  it('searches the configured profiles and forwards the abort signal only when present', () => {
    assert.deepEqual(interopLogsQueryOptions(createTestContext()), {
      logGroupResolutionMode: 'search-configured-profiles',
    });
    const signal = new AbortController().signal;
    assert.equal(interopLogsQueryOptions(createTestContext({ signal })).signal, signal);
  });
});
