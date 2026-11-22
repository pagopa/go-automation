import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { traceRowMatcher } from '../traceRows.js';

const TRACE = '1-6789abcd-0123456789abcdef01234567';
const COMPACT = '6789abcd0123456789abcdef01234567';
const OTHER = '1-00000000-111111111111111111111111';

describe('traceRowMatcher', () => {
  it('decides on the trace field, in any form and case', () => {
    const belongs = traceRowMatcher([TRACE]);
    assert.equal(belongs(COMPACT.toUpperCase(), ''), true);
    assert.equal(belongs(` ${TRACE} `, ''), true);
    assert.equal(belongs(OTHER, `quoted ${TRACE}`), false);
  });

  it('reads the message only without a trace field, and only a whole token', () => {
    const belongs = traceRowMatcher([COMPACT]);
    assert.equal(belongs('', `failed ${TRACE}`), true);
    assert.equal(belongs('   ', `{"trace":"${COMPACT}"}`), true);
    assert.equal(belongs('', `hash ab${COMPACT}cd`), false);
    assert.equal(belongs('', 'no trace'), false);
  });

  it('accepts any of several traces and compares other values as they are', () => {
    const belongs = traceRowMatcher([OTHER, TRACE, 'legacy-id']);
    assert.equal(belongs(TRACE, ''), true);
    assert.equal(belongs('legacy-id', ''), true);
    assert.equal(belongs('legacy-other', ''), false);
    assert.equal(traceRowMatcher([])(TRACE, TRACE), false);
  });
});
