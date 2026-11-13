import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GORegexCache } from '@pagopa/go-common/utils';

import type { RunbookContext } from '../../types/RunbookContext.js';
import { createTestServiceRegistry } from '../../../toolkits/common/testing/createTestServiceRegistry.js';
import { createInitialContext } from '../RunbookContextHelper.js';
import { compileContextRegex } from '../compileContextRegex.js';

describe('compileContextRegex', () => {
  it('reuses the compiled expression of the regex cache in the context', () => {
    const context = createInitialContext(new Map(), createTestServiceRegistry(), undefined, new GORegexCache());
    assert.strictEqual(compileContextRegex(context, 'err\\d+'), compileContextRegex(context, 'err\\d+'));
  });

  it('compiles without caching when the context has no cache', () => {
    const context: RunbookContext = createInitialContext(new Map(), createTestServiceRegistry());
    assert.strictEqual(context.regexCache, undefined);
    assert.notStrictEqual(compileContextRegex(context, 'a'), compileContextRegex(context, 'a'));
  });

  it('names the invalid pattern', () => {
    const context = createInitialContext(new Map(), createTestServiceRegistry(), undefined, new GORegexCache());
    assert.throws(() => compileContextRegex(context, '[x'), /Invalid regex pattern "\[x"/u);
  });
});
