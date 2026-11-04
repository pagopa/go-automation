import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { SENDTimelineElement } from '../models/SENDTimelineElement.js';
import { sortTimelineElements } from '../sortTimelineElements.js';

const element = (timelineElementId: string, timestamp: string): SENDTimelineElement => ({
  timelineElementId,
  timestamp,
  category: 'C',
});

const ids = (elements: ReadonlyArray<SENDTimelineElement>): ReadonlyArray<string> =>
  elements.map((item) => item.timelineElementId);

describe('sortTimelineElements', () => {
  it('orders mixed-precision timestamps chronologically', () => {
    const sorted = sortTimelineElements([
      element('c', '2026-01-02T10:00:00.5Z'),
      element('a', '2026-01-02T10:00:00Z'),
      element('d', '2026-01-02T10:00:01Z'),
      element('b', '2026-01-02T10:00:00.123456789Z'),
    ]);

    assert.deepEqual(ids(sorted), ['a', 'b', 'c', 'd']);
  });

  it('breaks ties within the same millisecond on sub-millisecond digits, then on id', () => {
    const sorted = sortTimelineElements([
      element('late', '2026-01-02T10:00:00.1234567Z'),
      element('early', '2026-01-02T10:00:00.123456Z'),
      element('y', '2026-01-02T10:00:00.2Z'),
      element('x', '2026-01-02T10:00:00.200Z'),
    ]);

    assert.deepEqual(ids(sorted), ['early', 'late', 'x', 'y']);
  });

  it('puts unparsable timestamps last and returns a new array', () => {
    const input = [element('bad', 'not-a-date'), element('ok', '2026-01-02T10:00:00Z')];

    const sorted = sortTimelineElements(input);

    assert.deepEqual(ids(sorted), ['ok', 'bad']);
    assert.deepEqual(ids(input), ['bad', 'ok'], 'input untouched');
  });
});
