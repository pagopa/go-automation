import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOJSONFieldExtractor } from '../GOJSONFieldExtractor.js';

/** One extraction expectation: source object, path or key, expected value. */
interface ExtractionCase {
  readonly label: string;
  readonly source: unknown;
  readonly field: string;
  readonly expected: unknown;
}

/** One extraction strategy under test. */
type ExtractFn = (source: unknown, field: string) => unknown;

/** Runs every case through the given extraction function. */
function assertExtractions(extract: ExtractFn, cases: ReadonlyArray<ExtractionCase>): void {
  for (const { label, source, field, expected } of cases) {
    assert.deepStrictEqual(extract(source, field), expected, label);
  }
}

/** Builds an object with `target` nested `levels` objects deep. */
function nestedTarget(levels: number): Record<string, unknown> {
  let obj: Record<string, unknown> = { target: 'found' };
  for (let i = 0; i < levels; i++) {
    obj = { nested: obj };
  }
  return obj;
}

describe('GOJSONFieldExtractor', () => {
  it('extractByPath navigates dot-notation and bracket indices', () => {
    const extractor = new GOJSONFieldExtractor();
    const falsy = { count: 0, active: false, label: '', value: null };
    assertExtractions(
      (source, field) => extractor.extractByPath(source, field),
      [
        { label: 'multi-level path', source: { a: { b: { c: { d: 42 } } } }, field: 'a.b.c.d', expected: 42 },
        { label: 'bracket index', source: { items: ['zero', 'one'] }, field: 'items[1]', expected: 'one' },
        {
          label: 'mixed dot and bracket',
          source: { data: { results: [{ status: 'OK' }, { status: 'ERROR' }] } },
          field: 'data.results[1].status',
          expected: 'ERROR',
        },
        { label: 'root-level bracket', source: [{ id: 1 }, { id: 2 }], field: '[0].id', expected: 1 },
        { label: 'numeric-like key', source: { '0': 'zero' }, field: '0', expected: 'zero' },
        { label: 'empty path returns the root', source: { a: 1 }, field: '', expected: { a: 1 } },
        { label: 'zero', source: falsy, field: 'count', expected: 0 },
        { label: 'false', source: falsy, field: 'active', expected: false },
        { label: 'empty string', source: falsy, field: 'label', expected: '' },
        { label: 'null is a value, not missing', source: falsy, field: 'value', expected: null },
        { label: 'missing key', source: { user: { name: 'Ada' } }, field: 'user.email', expected: undefined },
        { label: 'through a primitive', source: { user: 'string-value' }, field: 'user.name', expected: undefined },
        { label: 'out-of-bounds index', source: { items: ['a'] }, field: 'items[5]', expected: undefined },
        { label: 'null source', source: null, field: 'any.path', expected: undefined },
      ],
    );
  });

  it('extractByKey searches depth-first for the first own key, up to maxDepth', () => {
    const extractor = new GOJSONFieldExtractor();
    const withProto = Object.assign(Object.create({ inherited: 'proto-value' }) as object, { own: 'own-value' });
    assertExtractions(
      (source, field) => extractor.extractByKey(source, field),
      [
        { label: 'root level', source: { name: 'Ada' }, field: 'name', expected: 'Ada' },
        {
          label: 'nested object',
          source: { wrapper: { deep: { target: 'found' } } },
          field: 'target',
          expected: 'found',
        },
        {
          label: 'inside array elements',
          source: { items: [{ id: 1 }, { id: 2, secret: 'hidden' }] },
          field: 'secret',
          expected: 'hidden',
        },
        {
          label: 'first match wins',
          source: { a: { value: 'first' }, b: { value: 'second' } },
          field: 'value',
          expected: 'first',
        },
        { label: 'own property', source: withProto, field: 'own', expected: 'own-value' },
        { label: 'inherited property ignored', source: withProto, field: 'inherited', expected: undefined },
        { label: 'missing key', source: { a: 1, b: { c: 2 } }, field: 'nonExistent', expected: undefined },
        { label: 'null input', source: null, field: 'any', expected: undefined },
        { label: 'primitive input', source: 42, field: 'key', expected: undefined },
        {
          label: 'embedded JSON not parsed by default',
          source: { Body: '{"hidden":"value"}' },
          field: 'hidden',
          expected: undefined,
        },
        // Default maxDepth is 50: a target 60 levels deep is not reached.
        { label: 'beyond default maxDepth', source: nestedTarget(60), field: 'target', expected: undefined },
      ],
    );

    const deep = nestedTarget(3);
    assert.strictEqual(new GOJSONFieldExtractor({ maxDepth: 2 }).extractByKey(deep, 'target'), undefined);
    assert.strictEqual(new GOJSONFieldExtractor({ maxDepth: 3 }).extractByKey(deep, 'target'), 'found');
  });

  it('extractByKey parses embedded JSON strings when enabled', () => {
    const extractor = new GOJSONFieldExtractor({ parseEmbeddedJson: true });
    assertExtractions(
      (source, field) => extractor.extractByKey(source, field),
      [
        {
          label: 'embedded object',
          source: { Body: '{"orderId":"ORD-123","status":"completed"}' },
          field: 'orderId',
          expected: 'ORD-123',
        },
        {
          label: 'nested embedded JSON (SQS → SNS)',
          source: { Body: JSON.stringify({ Message: JSON.stringify({ eventType: 'NOTIFY' }) }) },
          field: 'eventType',
          expected: 'NOTIFY',
        },
        { label: 'embedded array', source: { data: '[{"x":1},{"x":2}]' }, field: 'x', expected: 1 },
        {
          label: 'invalid JSON skipped',
          source: { message: '{not valid json', actual: { target: 'found' } },
          field: 'target',
          expected: 'found',
        },
        {
          label: 'plain string skipped',
          source: { note: 'plain string with {braces}', nested: { target: 'correct' } },
          field: 'target',
          expected: 'correct',
        },
      ],
    );

    const strict = new GOJSONFieldExtractor({ parseEmbeddedJson: true, minEmbeddedJsonLength: 50 });
    assert.strictEqual(
      strict.extractByKey({ short: '{"a":1}', fallback: { a: 'from-object' } }, 'a'),
      'from-object',
      'strings shorter than minEmbeddedJsonLength are not parsed',
    );
  });

  it('extract prefers the path and falls back to a recursive search on the last segment', () => {
    const extractor = new GOJSONFieldExtractor({ parseEmbeddedJson: true });
    const sqsMessage = {
      messageId: 'msg-001',
      body: JSON.stringify({
        Type: 'Notification',
        Message: JSON.stringify({ eventType: 'DELIVERY_FAILED', recipient: { fiscalCode: 'ABCDEF12G34H567I' } }),
      }),
    };
    assertExtractions(
      (source, field) => extractor.extract(source, field),
      [
        {
          label: 'path wins over recursive',
          source: { user: { name: 'path-value' }, nested: { deep: { name: 'recursive-value' } } },
          field: 'user.name',
          expected: 'path-value',
        },
        {
          label: 'last segment fallback',
          source: { data: { nested: { email: 'ada@example.com' } } },
          field: 'contact.email',
          expected: 'ada@example.com',
        },
        { label: 'SQS: root key', source: sqsMessage, field: 'messageId', expected: 'msg-001' },
        { label: 'SQS: embedded key', source: sqsMessage, field: 'eventType', expected: 'DELIVERY_FAILED' },
        { label: 'SQS: deeply embedded key', source: sqsMessage, field: 'fiscalCode', expected: 'ABCDEF12G34H567I' },
        { label: 'not found', source: { a: 1, b: { c: 2 } }, field: 'nonExistent', expected: undefined },
        { label: 'empty array', source: [], field: 'any', expected: undefined },
      ],
    );
  });
});
