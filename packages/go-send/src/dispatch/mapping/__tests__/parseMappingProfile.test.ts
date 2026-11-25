import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { CanonicalField } from '../CanonicalField.js';
import { applyFillTransforms, mapRow } from '../mapRow.js';
import type { MappingProfile } from '../MappingProfile.js';
import { parseMappingProfile } from '../parseMappingProfile.js';

function profile(
  transforms: Readonly<Record<string, unknown>>,
  extra: Readonly<Record<string, unknown>> = {},
): MappingProfile {
  return parseMappingProfile(
    {
      name: 'p',
      columns: { a: 'subject', b: 'product', c: 'physicalAddress.foreignState', d: 'abstract' },
      transforms,
      ...extra,
    },
    'p.json',
  );
}

function mapped(parsed: MappingProfile, raw: Readonly<Record<string, string>>): ReadonlyMap<CanonicalField, string> {
  return applyFillTransforms(mapRow(raw, parsed), parsed);
}

describe('parseMappingProfile: transform semantics', () => {
  it('map replaces exact matches only and keeps other values', () => {
    const parsed = profile({ product: [{ op: 'map', values: { X: ' AR ', Y: '890' } }] });
    assert.equal(mapped(parsed, { b: 'X' }).get('product'), 'AR', 'dictionary values are trimmed');
    assert.equal(mapped(parsed, { b: ' Y ' }).get('product'), '890', 'row values are trimmed before transforms');
    assert.equal(mapped(parsed, { b: 'x' }).get('product'), 'x', 'case-sensitive');
    assert.equal(mapped(parsed, { b: 'Z' }).get('product'), 'Z');
    assert.equal(mapped(parsed, { b: 'toString' }).get('product'), 'toString', 'own keys only');
  });

  it('map to an empty value clears the field', () => {
    const parsed = profile({ product: [{ op: 'map', values: { NONE: '' } }] });
    assert.equal(mapped(parsed, { b: 'NONE' }).has('product'), false);
  });

  it('emptyIfIn clears listed values case-insensitively', () => {
    const parsed = profile({ 'physicalAddress.foreignState': [{ op: 'emptyIfIn', values: ['italia', ' IT '] }] });
    assert.equal(mapped(parsed, { c: 'Italia' }).has('physicalAddress.foreignState'), false);
    assert.equal(mapped(parsed, { c: 'it' }).has('physicalAddress.foreignState'), false, 'list items are trimmed');
    assert.equal(mapped(parsed, { c: 'FRANCIA' }).get('physicalAddress.foreignState'), 'FRANCIA');
  });

  it('upper and trim normalize the row value', () => {
    const parsed = profile({ product: [{ op: 'upper' }, { op: 'trim' }] });
    assert.equal(mapped(parsed, { b: 'rs' }).get('product'), 'RS');
  });

  it('default fills an empty field only', () => {
    const parsed = profile({ abstract: [{ op: 'default', value: ' Riassunto ' }] });
    assert.equal(mapped(parsed, {}).get('abstract'), 'Riassunto');
    assert.equal(mapped(parsed, { d: 'Dalla riga' }).get('abstract'), 'Dalla riga');
  });

  it('constantIfPresent fills an empty field when the trigger has a value', () => {
    const parsed = profile({ product: [{ op: 'constantIfPresent', field: 'subject', value: 'AR' }] });
    assert.equal(mapped(parsed, { a: 'Oggetto' }).get('product'), 'AR');
    assert.equal(mapped(parsed, {}).has('product'), false);
    assert.equal(mapped(parsed, { a: 'Oggetto', b: '890' }).get('product'), '890');
  });

  it('a value emptied by a normalizer can still be filled', () => {
    const parsed = profile({
      'physicalAddress.foreignState': [
        { op: 'emptyIfIn', values: ['-'] },
        { op: 'default', value: 'FRANCIA' },
      ],
    });
    assert.equal(mapped(parsed, { c: '-' }).get('physicalAddress.foreignState'), 'FRANCIA');
  });
});

describe('parseMappingProfile: validation', () => {
  it('rejects a normalizer after a fill on the same field', () => {
    assert.throws(
      () => profile({ product: [{ op: 'default', value: 'AR' }, { op: 'upper' }] }),
      /p\.json\.transforms\.product\[1\]: "upper" must come before constantIfPresent\/default/,
    );
  });

  it('rejects blank strings, consistently trimmed', () => {
    assert.throws(
      () => profile({ abstract: [{ op: 'default', value: '   ' }] }),
      /transforms\.abstract\[0\]\.value: must be a non-empty string/,
    );
    assert.throws(
      () => profile({ product: [{ op: 'emptyIfIn', values: ['IT', ' '] }] }),
      /values\[1\]: must be a non-empty string/,
    );
    assert.throws(() => profile({}, { name: ' ' }), /p\.json\.name: must be a non-empty string/);
    assert.throws(() => profile({}, { rowKeyColumn: '' }), /rowKeyColumn: must be a non-empty string/);
    assert.equal(profile({}, { name: ' qa ' }).name, 'qa');
  });

  it('checks parameters by op', () => {
    assert.throws(() => profile({ product: [{ op: 'map', values: ['a'] }] }), /values: must be an object/);
    assert.throws(() => profile({ product: [{ op: 'map', values: { a: 1 } }] }), /values\.a: must be a string/);
    assert.throws(
      () => profile({ product: [{ op: 'emptyIfIn', values: 'IT' }] }),
      /values: must be an array of strings/,
    );
    assert.throws(
      () => profile({ product: [{ op: 'constantIfPresent', field: 'nope', value: 'X' }] }),
      /field: unknown canonical field "nope"/,
    );
    assert.throws(() => profile({ product: [{ op: 'upper', value: 'X', extra: 1 }] }), /unknown key "extra"/);
  });

  it('names the outputColumns path', () => {
    assert.throws(() => profile({}, { outputColumns: 'iun' }), /^Error: p\.json\.outputColumns: must be an object$/);
    assert.throws(
      () => profile({}, { outputColumns: { iun: 'iun', x: 'y' } }),
      /p\.json\.outputColumns: unknown key "x"/,
    );
    assert.deepEqual(profile({}, { outputColumns: { requestId: 'RequestID' } }).outputColumns, {
      requestId: 'RequestID',
    });
  });

  it('validates the format block', () => {
    for (const skipRows of [-1, 1.5, '2']) {
      assert.throws(() => profile({}, { format: { skipRows } }), /format\.skipRows: must be a non-negative integer/);
    }
    assert.deepEqual(
      profile({}, { format: { type: 'csv', delimiter: '\t', skipRows: 2, encoding: 'latin1' } }).format,
      {
        type: 'csv',
        delimiter: '\t',
        skipRows: 2,
        encoding: 'latin1',
      },
    );
    assert.throws(() => profile({}, { format: { delimiter: '' } }), /format\.delimiter: must be a non-empty string/);
    assert.throws(() => profile({}, { format: { encoding: 'klingon' } }), /format\.encoding: unknown encoding/);
  });

  it('rejects arrays and null where objects are expected', () => {
    assert.throws(() => parseMappingProfile([], 'p.json'), /^Error: p\.json: must be an object$/);
    assert.throws(
      () => parseMappingProfile({ name: 'p', columns: null }, 'p.json'),
      /p\.json\.columns: must be an object/,
    );
    assert.throws(() => parseMappingProfile({ name: 'p', columns: {} }, 'p.json'), /at least one column/);
  });
});
