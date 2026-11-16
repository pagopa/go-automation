import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RepresentativeErrorSelector } from '../RepresentativeErrorSelector.js';
import type { RepresentativeErrorPolicy } from '../RepresentativeErrorPolicy.js';
import type { ServiceLogRow } from '../ServiceLogRow.js';

function row(message: string, level: string): ServiceLogRow {
  const lower = level.toLowerCase();
  return {
    fields: new Map(),
    message,
    level: lower,
    isErrorLevel: lower.includes('error') || lower.includes('warn'),
    hasErrorKeyword: /Exception|Error|failed/u.test(message),
  };
}

function select(policy: RepresentativeErrorPolicy, rows: ReadonlyArray<ServiceLogRow>): string {
  const selector = new RepresentativeErrorSelector(policy);
  for (const candidate of rows) selector.offer(candidate);
  return selector.result();
}

describe('RepresentativeErrorSelector', () => {
  const rows = [row('ERROR a very long first message', 'ERROR'), row('ERROR short', 'WARN'), row('', 'ERROR')];

  it('latest: keeps the most recent error- or warn-level message', () => {
    assert.strictEqual(select('latest', rows), 'ERROR short');
  });

  it('longest: keeps the longest error- or warn-level message', () => {
    assert.strictEqual(select('longest', rows), 'ERROR a very long first message');
  });

  it('falls back to keyword rows; latest accepts only level-less ones, longest also error-level ones', () => {
    const keywordRows = [
      row('Exception in a long level-less line', ''),
      row('failed', ''),
      row('debug Error', 'debug'),
    ];

    assert.strictEqual(select('latest', keywordRows), 'failed');
    assert.strictEqual(select('longest', keywordRows), 'Exception in a long level-less line');
  });

  it('returns an empty string when no row qualifies', () => {
    assert.strictEqual(select('latest', [row('all good', 'INFO')]), '');
    assert.strictEqual(select('longest', []), '');
  });
});
