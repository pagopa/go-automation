import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';

import { GOFileListImporter, GOJSONListImporter } from '@go-automation/go-common/core';

import type { SENDTimelineElement } from '../../../services/timeline/models/SENDTimelineElement.js';
import { DEFAULT_REQUEST_ID_OPTIONS } from '../defaultRequestIdOptions.js';
import { selectRequestIds } from '../selectRequestIds.js';

interface FixtureNotification {
  readonly iun: string;
  readonly timeline: ReadonlyArray<SENDTimelineElement>;
}

const FIXTURES = path.join(import.meta.dirname, '__fixtures__');

const element = (category: string, timestamp: string, id = `${category}.X`): SENDTimelineElement => ({
  category,
  timestamp,
  timelineElementId: id,
});

describe('selectRequestIds', () => {
  it('matches the jq used so far on real timelines (analog, digital, ATTEMPT_1, unreachable, none)', async () => {
    // Fixture: 35 timelines of TEST (iun, category, timelineElementId, timestamp only);
    // expected output produced by running the jq of §2.3 on the same file.
    const notifications: FixtureNotification[] = [];
    const importer = new GOJSONListImporter<FixtureNotification>({ jsonl: true });
    for await (const item of importer.importStream(path.join(FIXTURES, 'timelines-sample.jsonl'))) {
      notifications.push(item);
    }
    const expected = (await new GOFileListImporter().import(path.join(FIXTURES, 'timelines-sample-jq.csv'))).items;

    const actual: string[] = [];
    for (const notification of notifications) {
      const selection = selectRequestIds(notification.timeline, DEFAULT_REQUEST_ID_OPTIONS);
      for (const id of selection.requestIds.values()) actual.push(`${notification.iun},${id}`);
    }
    assert.equal(notifications.length, 35);
    assert.equal(expected.length, 32);
    assert.deepEqual(actual, expected);
  });

  it('takes the first element by timestamp, by exact category', () => {
    const selection = selectRequestIds(
      [
        element('PREPARE_ANALOG_DOMICILE', '2026-01-02T10:00:00Z', 'A1'),
        element('PREPARE_ANALOG_DOMICILE', '2026-01-02T09:00:00Z', 'A0'),
        element('PREPARE_ANALOG_DOMICILE_FAILURE', '2026-01-02T08:00:00Z', 'F'),
      ],
      DEFAULT_REQUEST_ID_OPTIONS,
    );
    assert.equal(selection.requestId, 'A0');
    assert.equal(selection.complete, true);
  });

  it('joins categories per-category, keeps the first with priority', () => {
    const timeline = [
      element('PREPARE_DIGITAL_DOMICILE', '2026-01-02T09:00:00Z', 'D0'),
      element('PREPARE_ANALOG_DOMICILE', '2026-01-02T10:00:00Z', 'A0'),
    ];
    assert.equal(selectRequestIds(timeline, DEFAULT_REQUEST_ID_OPTIONS).requestId, 'A0|D0');
    assert.equal(selectRequestIds(timeline, { ...DEFAULT_REQUEST_ID_OPTIONS, select: 'priority' }).requestId, 'A0');
  });

  it('waits for all categories with wait=all', () => {
    const timeline = [element('PREPARE_ANALOG_DOMICILE', '2026-01-02T10:00:00Z', 'A0')];
    const options = { ...DEFAULT_REQUEST_ID_OPTIONS, wait: 'all' as const };
    assert.equal(selectRequestIds(timeline, options).complete, false);
  });

  it('reports the end of the workflow, but not DIGITAL_FAILURE_WORKFLOW', () => {
    const ended = selectRequestIds(
      [element('REQUEST_ACCEPTED', '2026-01-02T09:00:00Z'), element('COMPLETELY_UNREACHABLE', '2026-01-03T09:00:00Z')],
      DEFAULT_REQUEST_ID_OPTIONS,
    );
    assert.equal(ended.complete, false);
    assert.equal(ended.endedBy, 'COMPLETELY_UNREACHABLE');
    assert.equal(ended.requestId, undefined);

    const digitalFailure = selectRequestIds(
      [element('DIGITAL_FAILURE_WORKFLOW', '2026-01-02T09:00:00Z')],
      DEFAULT_REQUEST_ID_OPTIONS,
    );
    assert.equal(digitalFailure.endedBy, undefined);
  });

  it('supports extra categories such as PREPARE_SIMPLE_REGISTERED_LETTER', () => {
    const selection = selectRequestIds([element('PREPARE_SIMPLE_REGISTERED_LETTER', '2026-01-02T09:00:00Z', 'S0')], {
      ...DEFAULT_REQUEST_ID_OPTIONS,
      categories: [...DEFAULT_REQUEST_ID_OPTIONS.categories, 'PREPARE_SIMPLE_REGISTERED_LETTER'],
    });
    assert.equal(selection.requestId, 'S0');
  });
});
