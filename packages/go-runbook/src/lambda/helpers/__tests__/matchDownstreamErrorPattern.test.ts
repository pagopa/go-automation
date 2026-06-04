import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ResultField } from '@go-automation/go-common/aws';

import { matchDownstreamErrorPattern, findDownstreamInRows } from '../matchDownstreamErrorPattern.js';
import type { DownstreamErrorPattern } from '../../types/DownstreamErrorPattern.js';

const PATTERNS: ReadonlyArray<DownstreamErrorPattern> = [
  { pattern: 'External service pn-emd-integration returned errors', target: 'pn-emd-integration' },
];

function row(message: string): ReadonlyArray<ResultField> {
  return [
    { field: '@timestamp', value: '2026-01-01T00:00:00.000Z' },
    { field: '@message', value: message },
  ];
}

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

describe('findDownstreamInRows', () => {
  it('matches a downstream pattern on a non-first row', () => {
    const match = findDownstreamInRows(
      [
        row('START RequestId: 11111111-2222-3333-4444-555555555555'),
        row('some unrelated info line'),
        row('External service pn-emd-integration returned errors { status code 404 }'),
      ],
      PATTERNS,
    );
    assert.deepStrictEqual(match, {
      target: 'pn-emd-integration',
      message: 'External service pn-emd-integration returned errors { status code 404 }',
    });
  });

  it('returns undefined when no row matches', () => {
    assert.strictEqual(findDownstreamInRows([row('nothing here')], PATTERNS), undefined);
  });
});
