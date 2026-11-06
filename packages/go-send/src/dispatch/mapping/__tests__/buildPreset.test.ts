import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildPreset } from '../buildPreset.js';
import type { CanonicalField } from '../CanonicalField.js';

const IUN = 'PAYK-MWDR-ZUAZ-202601-K-1';
const OTHER_IUN = 'TQJZ-VKMH-QDYX-202601-Q-1';
const REQUEST_ID = Buffer.from(IUN).toString('base64');

function preset(entries: ReadonlyArray<readonly [CanonicalField, string]>): ReturnType<typeof buildPreset> {
  return buildPreset(2, 'S-2', new Map(entries));
}

function issueKeys(result: ReturnType<typeof buildPreset>): ReadonlyArray<string> {
  return result.ok ? [] : result.issues.map((issue) => `${issue.code}:${issue.field ?? ''}`).sort();
}

describe('buildPreset', () => {
  it('derives the notificationRequestId from the IUN', () => {
    assert.deepEqual(preset([['preset.iun', IUN]]), {
      ok: true,
      preset: { rowIndex: 2, rowKey: 'S-2', iun: IUN, notificationRequestId: REQUEST_ID },
    });
  });

  it('derives the IUN from the notificationRequestId', () => {
    const result = preset([['preset.notificationRequestId', REQUEST_ID]]);
    assert.ok(result.ok);
    assert.equal(result.preset.iun, IUN);
    assert.equal(result.preset.notificationRequestId, REQUEST_ID);
  });

  it('accepts both when they agree', () => {
    const result = preset([
      ['preset.iun', IUN],
      ['preset.notificationRequestId', REQUEST_ID],
    ]);
    assert.ok(result.ok);
    assert.equal(result.preset.iun, IUN);
  });

  it('rejects an IUN that differs from the one encoded in the notificationRequestId', () => {
    const result = preset([
      ['preset.iun', OTHER_IUN],
      ['preset.notificationRequestId', REQUEST_ID],
    ]);
    assert.deepEqual(issueKeys(result), ['PRESET_MISMATCH:preset.notificationRequestId']);
    assert.ok(!result.ok);
    assert.match(result.issues[0]?.message ?? '', new RegExp(`encodes ${IUN}, not preset.iun ${OTHER_IUN}`));
  });

  it('requires one of the two identifiers', () => {
    assert.deepEqual(issueKeys(preset([])), ['MISSING_FIELD:preset.iun']);
  });

  it('rejects malformed identifiers, reporting each of them', () => {
    assert.deepEqual(issueKeys(preset([['preset.iun', 'not-an-iun']])), ['INVALID_FORMAT:preset.iun']);
    assert.deepEqual(issueKeys(preset([['preset.notificationRequestId', 'short']])), [
      'INVALID_FORMAT:preset.notificationRequestId',
    ]);
    const notAnIun = Buffer.from('ABCDEFGHIJKLMNOPQRSTUVWXY').toString('base64');
    assert.deepEqual(issueKeys(preset([['preset.notificationRequestId', notAnIun]])), [
      'INVALID_FORMAT:preset.notificationRequestId',
    ]);
    assert.deepEqual(
      issueKeys(
        preset([
          ['preset.iun', 'bad'],
          ['preset.notificationRequestId', 'short'],
        ]),
      ),
      ['INVALID_FORMAT:preset.iun', 'INVALID_FORMAT:preset.notificationRequestId'],
    );
  });

  it('rejects a valid IUN with a malformed notificationRequestId', () => {
    assert.deepEqual(
      issueKeys(
        preset([
          ['preset.iun', IUN],
          ['preset.notificationRequestId', 'short'],
        ]),
      ),
      ['INVALID_FORMAT:preset.notificationRequestId'],
    );
  });
});
