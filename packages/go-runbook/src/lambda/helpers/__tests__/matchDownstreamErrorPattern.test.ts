import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { matchDownstreamErrorPattern } from '../matchDownstreamErrorPattern.js';
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
