import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildCatalog, diffCatalog } from '../catalog.js';
import type { AutomaticRunbookDescriptorV1 } from '../external.js';
import { RUNBOOK } from './fixtures.js';

/** A catalog of `runbooks`; publication metadata never changes the classification. */
function catalog(
  runbooks: ReadonlyArray<AutomaticRunbookDescriptorV1>,
  artifactRevision = 'a',
  actorArn = 'test',
): ReturnType<typeof buildCatalog> {
  return buildCatalog({ environment: 'test', artifactRevision, actorArn, changeNote: 'note', runbooks });
}

const BASE = buildCatalog({
  environment: 'test',
  artifactRevision: 'a',
  actorArn: 'test',
  changeNote: 'base',
  publishedAt: '2026-07-01T00:00:00.000Z',
  runbooks: [RUNBOOK],
});

describe('catalog rollout classification', () => {
  const cases: ReadonlyArray<readonly [string, ReturnType<typeof buildCatalog>, string, ReadonlyArray<string>]> = [
    [
      'an identical payload republished by someone else as unchanged',
      catalog([RUNBOOK], 'a', 'other'),
      'UNCHANGED',
      [],
    ],
    ['a worker-only revision change as compatible', catalog([RUNBOOK], 'b'), 'COMPATIBLE', []],
    ['a removed runbook as incompatible, to drain', catalog([], 'b'), 'INCOMPATIBLE', [RUNBOOK.key]],
    [
      'an alarm-name change of an existing key as incompatible',
      catalog([{ ...RUNBOOK, alarmNames: ['send-api-errors-renamed'] }]),
      'INCOMPATIBLE',
      [RUNBOOK.key],
    ],
    [
      'an alarm alias added to an existing key as incompatible',
      catalog([{ ...RUNBOOK, alarmNames: ['send-api-errors', 'send-api-errors-att'] }]),
      'INCOMPATIBLE',
      [RUNBOOK.key],
    ],
    ['a version bump as incompatible', catalog([{ ...RUNBOOK, version: '2.0.0' }], 'b'), 'INCOMPATIBLE', [RUNBOOK.key]],
  ];

  for (const [name, next, kind, incompatible] of cases) {
    it(`classifies ${name}`, () => {
      const diff = diffCatalog(BASE, next);
      assert.strictEqual(diff.kind, kind);
      assert.deepStrictEqual(diff.incompatible, incompatible);
    });
  }
});
