import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { messageRow } from '../../../../../../__tests__/helpers/logRow.js';

import { downstreamFinder, matchDownstreamErrorPattern } from '../matchDownstreamErrorPattern.js';
import type { DownstreamErrorPattern } from '../../types/DownstreamErrorPattern.js';

const PATTERNS: ReadonlyArray<DownstreamErrorPattern> = [
  { pattern: 'External service pn-emd-integration returned errors', target: 'pn-emd-integration' },
];

describe('matchDownstreamErrorPattern', () => {
  it('returns the target when a pattern matches', () => {
    const message = 'External service pn-emd-integration returned errors { status code 404 }';
    assert.strictEqual(matchDownstreamErrorPattern(message, PATTERNS), 'pn-emd-integration');
  });

  it('returns undefined when no pattern matches', () => {
    assert.strictEqual(matchDownstreamErrorPattern('something else', PATTERNS), undefined);
  });

  it('ignores invalid regex patterns without throwing', () => {
    const broken: ReadonlyArray<DownstreamErrorPattern> = [{ pattern: '([', target: 'x' }];
    assert.strictEqual(matchDownstreamErrorPattern('anything', broken), undefined);
  });
});

describe('downstreamFinder', () => {
  it('matches a downstream pattern on a non-first row', () => {
    const match = downstreamFinder(PATTERNS)([
      messageRow('START RequestId: 11111111-2222-3333-4444-555555555555'),
      messageRow('some unrelated info line'),
      messageRow('External service pn-emd-integration returned errors { status code 404 }'),
    ]);
    assert.deepStrictEqual(match, {
      target: 'pn-emd-integration',
      message: 'External service pn-emd-integration returned errors { status code 404 }',
    });
  });

  it('returns undefined when no row matches', () => {
    assert.strictEqual(downstreamFinder(PATTERNS)([messageRow('nothing here')]), undefined);
  });
});
