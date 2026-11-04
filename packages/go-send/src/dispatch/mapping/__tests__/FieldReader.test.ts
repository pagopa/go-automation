import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { CanonicalField } from '../CanonicalField.js';
import { FieldReader } from '../FieldReader.js';

const POLICIES: ReadonlySet<'FLAT_RATE' | 'DELIVERY_MODE'> = new Set(['FLAT_RATE', 'DELIVERY_MODE']);

function reader(
  entries: ReadonlyArray<readonly [CanonicalField, string]>,
  defaults: ReadonlyArray<readonly [CanonicalField, string]> = [],
): FieldReader {
  return new FieldReader(new Map(entries), new Map(defaults));
}

function codes(fieldReader: FieldReader): ReadonlyArray<string> {
  return fieldReader.issues.map((issue) => `${issue.code}:${issue.field ?? '-'}`);
}

describe('FieldReader', () => {
  it('reads a required value, falling back to the neutral default', () => {
    const fromRow = reader([['subject', 'Atto']], [['subject', 'Default']]);
    const fromDefault = reader([], [['subject', 'Default']]);

    assert.equal(fromRow.required('subject', 10), 'Atto');
    assert.equal(fromDefault.required('subject', 10), 'Default');
    assert.equal(fromRow.hasIssues() || fromDefault.hasIssues(), false);
  });

  it('records MISSING_FIELD and TOO_LONG for required values', () => {
    const fieldReader = reader([['subject', 'troppo lungo']]);

    assert.equal(fieldReader.required('abstract', 10), undefined);
    assert.equal(fieldReader.required('subject', 5), undefined);
    assert.deepEqual(codes(fieldReader), ['MISSING_FIELD:abstract', 'TOO_LONG:subject']);
  });

  it('reads optional values without defaults and checks only their length', () => {
    const fieldReader = reader([['physicalAddress.at', 'Presso']], [['abstract', 'Default']]);

    assert.equal(fieldReader.optional('abstract', 10), undefined, 'neutral defaults are ignored');
    assert.equal(fieldReader.optional('physicalAddress.at', 10), 'Presso');
    assert.equal(fieldReader.optional('physicalAddress.at', 3), undefined);
    assert.deepEqual(codes(fieldReader), ['TOO_LONG:physicalAddress.at']);
  });

  it('exposes raw values and values with defaults', () => {
    const fieldReader = reader([['subject', 'Atto']], [['abstract', 'Default']]);

    assert.equal(fieldReader.value('abstract'), undefined);
    assert.equal(fieldReader.valueOrDefault('abstract'), 'Default');
    assert.equal(fieldReader.value('subject'), 'Atto');
  });

  it('matches patterns, upper-casing when asked, and reports missing or malformed values', () => {
    const fieldReader = reader([
      ['physicalAddress.zip', '00100'],
      ['physicalAddress.province', 'rm'],
      ['notificationOptions.taxonomyCode', 'abc'],
    ]);

    assert.equal(fieldReader.matching('physicalAddress.zip', /^\d{5}$/, 'five digits', true), '00100');
    assert.equal(fieldReader.matchingUpperCase('physicalAddress.province', /^[A-Z]{2}$/, 'two letters', true), 'RM');
    assert.equal(fieldReader.matching('notificationOptions.taxonomyCode', /^\d{6}[AN]$/, 'a code', true), undefined);
    assert.equal(fieldReader.matching('recipient.taxId', /./, 'a tax id', false), undefined);
    assert.equal(fieldReader.matching('recipient.denomination', /./, 'a name', true), undefined);
    assert.deepEqual(codes(fieldReader), [
      'INVALID_FORMAT:notificationOptions.taxonomyCode',
      'MISSING_FIELD:recipient.denomination',
    ]);
  });

  it('reads enumerated values case-insensitively', () => {
    const fieldReader = reader([
      ['notificationOptions.notificationFeePolicy', 'delivery_mode'],
      ['product', 'XX'],
    ]);

    assert.equal(fieldReader.oneOf('notificationOptions.notificationFeePolicy', POLICIES, true), 'DELIVERY_MODE');
    assert.equal(fieldReader.oneOf('product', POLICIES, true), undefined);
    assert.equal(fieldReader.oneOf('recipient.type', POLICIES, false), undefined);
    assert.equal(fieldReader.oneOf('digitalDomicile.type', POLICIES, true), undefined);
    assert.deepEqual(codes(fieldReader), ['INVALID_ENUM:product', 'MISSING_FIELD:digitalDomicile.type']);
  });

  it('reads non-negative integers within the upper bound', () => {
    const fieldReader = reader([
      ['notificationOptions.paFee', '100'],
      ['notificationOptions.vat', '101'],
      ['payment.applyCost', '-1'],
    ]);

    assert.equal(fieldReader.integer('notificationOptions.paFee', 'euro cents'), 100);
    assert.equal(fieldReader.integer('notificationOptions.vat', 'percent', 100), undefined);
    assert.equal(fieldReader.integer('payment.applyCost', 'units'), undefined);
    assert.equal(fieldReader.integer('payment.noticeCode', 'units'), undefined, 'absent: no issue');
    assert.deepEqual(codes(fieldReader), ['OUT_OF_RANGE:notificationOptions.vat', 'INVALID_FORMAT:payment.applyCost']);
  });

  it('collects every issue of the row in the failure', () => {
    const fieldReader = reader([]);
    fieldReader.required('subject', 10);
    fieldReader.issue('CUSTOM', undefined, 'row-level problem');

    const failure = fieldReader.failure();

    assert.equal(failure.ok, false);
    assert.deepEqual(
      failure.issues.map((issue) => issue.code),
      ['MISSING_FIELD', 'CUSTOM'],
    );
    assert.equal('field' in (failure.issues[1] ?? {}), false, 'no field key when the issue has none');
  });

  it('adds an INTERNAL issue when a failure has no recorded issue', () => {
    const failure = reader([]).failure();

    assert.deepEqual(
      failure.issues.map((issue) => issue.code),
      ['INTERNAL'],
    );
  });
});
