import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';

import { GOFileListImporter, GOJSONListImporter } from '@pagopa/go-common/importers';

import type { SENDTimelineElement } from '../../../services/timeline/models/SENDTimelineElement.js';
import { DEFAULT_REQUEST_ID_OPTIONS } from '../defaultRequestIdOptions.js';
import { selectRequestIds } from '../selectRequestIds.js';

interface FixtureNotification {
  readonly iun: string;
  readonly timeline: ReadonlyArray<SENDTimelineElement>;
}

const FIXTURES = path.join(import.meta.dirname, '__fixtures__');

/** Rule before the paper categories: analog, then digital, ids as in the timeline. */
const JQ_OPTIONS = {
  ...DEFAULT_REQUEST_ID_OPTIONS,
  categories: ['PREPARE_ANALOG_DOMICILE', 'PREPARE_DIGITAL_DOMICILE'],
  suffix: '',
};

async function fixtureNotifications(): Promise<FixtureNotification[]> {
  const notifications: FixtureNotification[] = [];
  const importer = new GOJSONListImporter<FixtureNotification>({ jsonl: true });
  for await (const item of importer.importStream(path.join(FIXTURES, 'timelines-sample.jsonl'))) {
    notifications.push(item);
  }
  return notifications;
}

const element = (category: string, timestamp: string, id = `${category}.X`): SENDTimelineElement => ({
  category,
  timestamp,
  timelineElementId: id,
});

describe('selectRequestIds', () => {
  it('matches the jq used so far on real timelines (analog, digital, ATTEMPT_1, unreachable, none)', async () => {
    // Fixture: 35 timelines of TEST (iun, category, timelineElementId, timestamp only);
    // expected output produced by running the jq of §2.3 on the same file.
    const notifications = await fixtureNotifications();
    const expected = (await new GOFileListImporter().import(path.join(FIXTURES, 'timelines-sample-jq.csv'))).items;

    const actual: string[] = [];
    for (const notification of notifications) {
      const selection = selectRequestIds(notification.timeline, JQ_OPTIONS);
      for (const id of selection.requestIds.values()) actual.push(`${notification.iun},${id}`);
    }
    assert.equal(notifications.length, 35);
    assert.equal(expected.length, 32);
    assert.deepEqual(actual, expected);
  });

  it('finds the paper ids with the suffix on real timelines (analog, simple registered letter)', async () => {
    // Expected output computed independently from the same file: first element by timestamp
    // of PREPARE_ANALOG_DOMICILE and PREPARE_SIMPLE_REGISTERED_LETTER, plus `.PCRETRY_0`.
    const notifications = await fixtureNotifications();
    const expected = (await new GOFileListImporter().import(path.join(FIXTURES, 'timelines-sample-paper.csv'))).items;
    const options = { ...DEFAULT_REQUEST_ID_OPTIONS, suffix: '.PCRETRY_0' };

    const actual: string[] = [];
    for (const notification of notifications) {
      const selection = selectRequestIds(notification.timeline, options);
      for (const id of selection.requestIds.values()) actual.push(`${notification.iun},${id}`);
    }
    assert.equal(expected.length, 32);
    assert.equal(expected.filter((line) => line.includes('PREPARE_SIMPLE_REGISTERED_LETTER')).length, 12);
    assert.deepEqual(actual, expected);
  });

  it('finds the simple registered letter after a failed digital workflow', () => {
    const selection = selectRequestIds(
      [
        element('PREPARE_DIGITAL_DOMICILE', '2026-01-02T09:00:00Z', 'D0'),
        element('DIGITAL_FAILURE_WORKFLOW', '2026-01-03T09:00:00Z'),
        element('PREPARE_SIMPLE_REGISTERED_LETTER', '2026-01-03T10:00:00Z', 'S0'),
      ],
      DEFAULT_REQUEST_ID_OPTIONS,
    );
    assert.equal(selection.requestId, 'S0');
    assert.deepEqual([...selection.requestIds.keys()], ['PREPARE_SIMPLE_REGISTERED_LETTER']);
  });

  it('appends the suffix to every id, in the joined value and with priority', () => {
    const timeline = [
      element('PREPARE_SIMPLE_REGISTERED_LETTER', '2026-01-02T09:00:00Z', 'S0'),
      element('PREPARE_ANALOG_DOMICILE', '2026-01-02T10:00:00Z', 'A0'),
    ];
    const options = { ...DEFAULT_REQUEST_ID_OPTIONS, suffix: '.PCRETRY_0' };

    const perCategory = selectRequestIds(timeline, options);
    assert.equal(perCategory.requestId, 'A0.PCRETRY_0|S0.PCRETRY_0');
    assert.deepEqual(Object.fromEntries(perCategory.requestIds), {
      PREPARE_ANALOG_DOMICILE: 'A0.PCRETRY_0',
      PREPARE_SIMPLE_REGISTERED_LETTER: 'S0.PCRETRY_0',
    });
    assert.equal(selectRequestIds(timeline, { ...options, select: 'priority' }).requestId, 'A0.PCRETRY_0');
    assert.equal(selectRequestIds(timeline, { ...options, suffix: '' }).requestId, 'A0|S0');
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
      element('PREPARE_SIMPLE_REGISTERED_LETTER', '2026-01-02T09:00:00Z', 'S0'),
      element('PREPARE_ANALOG_DOMICILE', '2026-01-02T10:00:00Z', 'A0'),
    ];
    assert.equal(selectRequestIds(timeline, DEFAULT_REQUEST_ID_OPTIONS).requestId, 'A0|S0');
    assert.equal(selectRequestIds(timeline, { ...DEFAULT_REQUEST_ID_OPTIONS, select: 'priority' }).requestId, 'A0');
  });

  it('waits for all categories with wait=all', () => {
    const timeline = [element('PREPARE_ANALOG_DOMICILE', '2026-01-02T10:00:00Z', 'A0')];
    const options = { ...DEFAULT_REQUEST_ID_OPTIONS, wait: 'all' as const };
    assert.equal(selectRequestIds(timeline, options).complete, false);
  });

  it('completes wait=all with a repeated category once every distinct category is found', () => {
    const timeline = [element('PREPARE_ANALOG_DOMICILE', '2026-01-02T10:00:00Z', 'A0')];
    const options = {
      ...DEFAULT_REQUEST_ID_OPTIONS,
      categories: ['PREPARE_ANALOG_DOMICILE', 'PREPARE_ANALOG_DOMICILE'],
      wait: 'all' as const,
    };

    const selection = selectRequestIds(timeline, options);

    assert.equal(selection.complete, true);
    assert.equal(selection.requestId, 'A0');
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

  it('supports extra categories such as PREPARE_DIGITAL_DOMICILE', () => {
    const selection = selectRequestIds([element('PREPARE_DIGITAL_DOMICILE', '2026-01-02T09:00:00Z', 'D0')], {
      ...DEFAULT_REQUEST_ID_OPTIONS,
      categories: [...DEFAULT_REQUEST_ID_OPTIONS.categories, 'PREPARE_DIGITAL_DOMICILE'],
    });
    assert.equal(selection.requestId, 'D0');
  });
  it('orders mixed-precision timestamps as instants (…:00.5Z is after …:00Z)', () => {
    const later = element('PREPARE_ANALOG_DOMICILE', '2026-01-02T10:00:00.5Z', 'PREPARE_ANALOG_DOMICILE.ATTEMPT_1');
    const earlier = element('PREPARE_ANALOG_DOMICILE', '2026-01-02T10:00:00Z', 'PREPARE_ANALOG_DOMICILE.ATTEMPT_0');
    const nanos = element('PREPARE_ANALOG_DOMICILE', '2026-01-02T10:00:00.000000001Z', 'PREPARE_ANALOG_DOMICILE.NANO');

    // As strings '…:00.5Z' < '…:00Z' ('.' < 'Z'): the later attempt would win.
    assert.equal(
      selectRequestIds([later, earlier], DEFAULT_REQUEST_ID_OPTIONS).requestId,
      'PREPARE_ANALOG_DOMICILE.ATTEMPT_0',
    );
    assert.equal(
      selectRequestIds([later, nanos], DEFAULT_REQUEST_ID_OPTIONS).requestId,
      'PREPARE_ANALOG_DOMICILE.NANO',
      'sub-millisecond digits count',
    );
  });
});
