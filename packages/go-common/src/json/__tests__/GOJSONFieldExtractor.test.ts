/**
 * Tests for GOJSONFieldExtractor
 *
 * Covers all three extraction strategies:
 * - extract()       : path-first + recursive fallback
 * - extractByPath() : dot-notation / bracket navigation only
 * - extractByKey()  : depth-limited recursive key search
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GOJSONFieldExtractor } from '../GOJSONFieldExtractor.js';

// ── extractByPath ───────────────────────────────────────────────────────────

describe('GOJSONFieldExtractor.extractByPath', () => {
  const extractor = new GOJSONFieldExtractor();

  it('navigates simple dot-notation path', () => {
    const obj = { user: { name: 'Ada' } };
    assert.strictEqual(extractor.extractByPath(obj, 'user.name'), 'Ada');
  });

  it('navigates nested multi-level path', () => {
    const obj = { a: { b: { c: { d: 42 } } } };
    assert.strictEqual(extractor.extractByPath(obj, 'a.b.c.d'), 42);
  });

  it('navigates array bracket indices', () => {
    const obj = { items: ['zero', 'one', 'two'] };
    assert.strictEqual(extractor.extractByPath(obj, 'items[1]'), 'one');
  });

  it('navigates mixed dot-notation and bracket indices', () => {
    const obj = { data: { results: [{ status: 'OK' }, { status: 'ERROR' }] } };
    assert.strictEqual(extractor.extractByPath(obj, 'data.results[1].status'), 'ERROR');
  });

  it('navigates root-level bracket index on array', () => {
    const arr = [{ id: 1 }, { id: 2 }];
    assert.strictEqual(extractor.extractByPath(arr, '[0].id'), 1);
  });

  it('returns undefined for non-existent path', () => {
    const obj = { user: { name: 'Ada' } };
    assert.strictEqual(extractor.extractByPath(obj, 'user.email'), undefined);
  });

  it('returns undefined for path through primitive', () => {
    const obj = { user: 'string-value' };
    assert.strictEqual(extractor.extractByPath(obj, 'user.name'), undefined);
  });

  it('returns undefined for out-of-bounds index', () => {
    const obj = { items: ['a'] };
    assert.strictEqual(extractor.extractByPath(obj, 'items[5]'), undefined);
  });

  it('returns undefined when source is null', () => {
    assert.strictEqual(extractor.extractByPath(null, 'any.path'), undefined);
  });

  it('returns undefined when source is undefined', () => {
    assert.strictEqual(extractor.extractByPath(undefined, 'any'), undefined);
  });

  it('returns the root object for empty path', () => {
    const obj = { a: 1 };
    // Empty path means no segments to navigate, so it returns the object itself
    assert.deepStrictEqual(extractor.extractByPath(obj, ''), obj);
  });

  it('returns falsy values correctly (0, false, empty string)', () => {
    const obj = { count: 0, active: false, label: '' };
    assert.strictEqual(extractor.extractByPath(obj, 'count'), 0);
    assert.strictEqual(extractor.extractByPath(obj, 'active'), false);
    assert.strictEqual(extractor.extractByPath(obj, 'label'), '');
  });

  it('returns null value without treating it as missing', () => {
    const obj = { value: null };
    assert.strictEqual(extractor.extractByPath(obj, 'value'), null);
  });
});

// ── extractByKey ────────────────────────────────────────────────────────────

describe('GOJSONFieldExtractor.extractByKey', () => {
  const extractor = new GOJSONFieldExtractor();

  it('finds key at root level', () => {
    const obj = { name: 'Ada', age: 36 };
    assert.strictEqual(extractor.extractByKey(obj, 'name'), 'Ada');
  });

  it('finds key in nested object', () => {
    const obj = { wrapper: { deep: { target: 'found' } } };
    assert.strictEqual(extractor.extractByKey(obj, 'target'), 'found');
  });

  it('finds key inside array elements', () => {
    const obj = { items: [{ id: 1 }, { id: 2, secret: 'hidden' }] };
    assert.strictEqual(extractor.extractByKey(obj, 'secret'), 'hidden');
  });

  it('returns first match in depth-first order', () => {
    const obj = {
      a: { value: 'first' },
      b: { value: 'second' },
    };
    assert.strictEqual(extractor.extractByKey(obj, 'value'), 'first');
  });

  it('returns undefined for non-existent key', () => {
    const obj = { a: 1, b: { c: 2 } };
    assert.strictEqual(extractor.extractByKey(obj, 'nonExistent'), undefined);
  });

  it('returns undefined for null input', () => {
    assert.strictEqual(extractor.extractByKey(null, 'any'), undefined);
  });

  it('returns undefined for primitive input', () => {
    assert.strictEqual(extractor.extractByKey('just a string', 'key'), undefined);
    assert.strictEqual(extractor.extractByKey(42, 'key'), undefined);
  });

  it('respects maxDepth option', () => {
    const extractor2 = new GOJSONFieldExtractor({ maxDepth: 2 });
    const obj = { level1: { level2: { level3: { target: 'deep' } } } };
    // At maxDepth 2, level3 is at depth 3, so target at depth 4 is unreachable
    assert.strictEqual(extractor2.extractByKey(obj, 'target'), undefined);
  });

  it('finds key within maxDepth limit', () => {
    const extractor2 = new GOJSONFieldExtractor({ maxDepth: 5 });
    const obj = { level1: { level2: { level3: { target: 'reachable' } } } };
    assert.strictEqual(extractor2.extractByKey(obj, 'target'), 'reachable');
  });
});

// ── extractByKey with embedded JSON parsing ─────────────────────────────────

describe('GOJSONFieldExtractor.extractByKey (parseEmbeddedJson)', () => {
  const extractor = new GOJSONFieldExtractor({ parseEmbeddedJson: true });

  it('parses embedded JSON string and extracts key from it', () => {
    const obj = {
      Body: '{"orderId":"ORD-123","status":"completed"}',
    };
    assert.strictEqual(extractor.extractByKey(obj, 'orderId'), 'ORD-123');
  });

  it('parses nested embedded JSON (SQS → SNS pattern)', () => {
    const obj = {
      Body: JSON.stringify({
        Message: JSON.stringify({ eventType: 'NOTIFY', payload: { id: 99 } }),
      }),
    };
    assert.strictEqual(extractor.extractByKey(obj, 'eventType'), 'NOTIFY');
  });

  it('parses embedded JSON array', () => {
    const obj = {
      data: '[{"x":1},{"x":2}]',
    };
    // The key 'x' is found inside the first element of the parsed array
    assert.strictEqual(extractor.extractByKey(obj, 'x'), 1);
  });

  it('ignores invalid JSON strings gracefully', () => {
    const obj = {
      message: '{not valid json',
      actual: { target: 'found' },
    };
    assert.strictEqual(extractor.extractByKey(obj, 'target'), 'found');
  });

  it('ignores strings shorter than minEmbeddedJsonLength', () => {
    const extractor2 = new GOJSONFieldExtractor({
      parseEmbeddedJson: true,
      minEmbeddedJsonLength: 50,
    });
    const obj = {
      short: '{"a":1}',
      fallback: { a: 'from-object' },
    };
    // The embedded JSON string is too short (7 chars < 50), so it falls back
    assert.strictEqual(extractor2.extractByKey(obj, 'a'), 'from-object');
  });

  it('does NOT parse embedded JSON when option is disabled', () => {
    const noParseExtractor = new GOJSONFieldExtractor({ parseEmbeddedJson: false });
    const obj = {
      Body: '{"hidden":"value"}',
    };
    assert.strictEqual(noParseExtractor.extractByKey(obj, 'hidden'), undefined);
  });

  it('ignores non-JSON strings (no { or [ prefix)', () => {
    const obj = {
      note: 'just a plain string with {braces} inside',
      nested: { target: 'correct' },
    };
    assert.strictEqual(extractor.extractByKey(obj, 'target'), 'correct');
  });
});

// ── extract (combined strategy) ─────────────────────────────────────────────

describe('GOJSONFieldExtractor.extract', () => {
  const extractor = new GOJSONFieldExtractor({ parseEmbeddedJson: true });

  it('prefers path-based result over recursive', () => {
    const obj = {
      user: { name: 'path-value' },
      nested: { deep: { name: 'recursive-value' } },
    };
    // 'user.name' resolves by path, so recursive search is not attempted
    assert.strictEqual(extractor.extract(obj, 'user.name'), 'path-value');
  });

  it('falls back to recursive search when path fails', () => {
    const obj = {
      wrapper: { deep: { city: 'Rome' } },
    };
    // 'city' is not a valid path from root, but recursive finds it
    assert.strictEqual(extractor.extract(obj, 'city'), 'Rome');
  });

  it('uses last segment of dot-path for recursive fallback', () => {
    const obj = {
      data: { nested: { email: 'ada@example.com' } },
    };
    // 'contact.email' fails by path (no 'contact' key at root)
    // Falls back to recursive search using 'email' (last segment)
    assert.strictEqual(extractor.extract(obj, 'contact.email'), 'ada@example.com');
  });

  it('returns undefined when neither strategy finds the value', () => {
    const obj = { a: 1, b: { c: 2 } };
    assert.strictEqual(extractor.extract(obj, 'nonExistent'), undefined);
  });

  it('handles real-world SQS message structure', () => {
    const sqsMessage = {
      messageId: 'msg-001',
      body: JSON.stringify({
        Type: 'Notification',
        Message: JSON.stringify({
          eventType: 'DELIVERY_FAILED',
          iun: 'IUN-2024-001',
          recipient: { fiscalCode: 'ABCDEF12G34H567I' },
        }),
      }),
    };

    assert.strictEqual(extractor.extract(sqsMessage, 'eventType'), 'DELIVERY_FAILED');
    assert.strictEqual(extractor.extract(sqsMessage, 'iun'), 'IUN-2024-001');
    assert.strictEqual(extractor.extract(sqsMessage, 'fiscalCode'), 'ABCDEF12G34H567I');
    assert.strictEqual(extractor.extract(sqsMessage, 'messageId'), 'msg-001');
  });

  it('handles CloudWatch alarm structure', () => {
    const alarm = {
      AlarmName: 'pn-delivery-B2B-ApiGwAlarm',
      StateValue: 'ALARM',
      Trigger: {
        MetricName: '5XXError',
        Namespace: 'AWS/ApiGateway',
        Dimensions: [{ name: 'ApiName', value: 'pn-delivery-B2B' }],
      },
    };

    assert.strictEqual(extractor.extract(alarm, 'AlarmName'), 'pn-delivery-B2B-ApiGwAlarm');
    assert.strictEqual(extractor.extract(alarm, 'Trigger.MetricName'), '5XXError');
    assert.strictEqual(extractor.extract(alarm, 'Trigger.Dimensions[0].value'), 'pn-delivery-B2B');
  });
});

// ── Constructor defaults ────────────────────────────────────────────────────

describe('GOJSONFieldExtractor constructor defaults', () => {
  it('creates instance with default options', () => {
    const extractor = new GOJSONFieldExtractor();
    // Verify it works — defaults are maxDepth=50, parseEmbeddedJson=false
    const obj = { key: 'value' };
    assert.strictEqual(extractor.extract(obj, 'key'), 'value');
  });

  it('creates instance with explicit options', () => {
    const extractor = new GOJSONFieldExtractor({
      maxDepth: 10,
      parseEmbeddedJson: true,
      minEmbeddedJsonLength: 5,
    });
    const obj = { data: '{"nested":"ok"}' };
    assert.strictEqual(extractor.extractByKey(obj, 'nested'), 'ok');
  });

  it('does not parse embedded JSON by default', () => {
    const extractor = new GOJSONFieldExtractor();
    const obj = { data: '{"hidden":"value"}' };
    assert.strictEqual(extractor.extractByKey(obj, 'hidden'), undefined);
  });
});

// ── Edge cases ──────────────────────────────────────────────────────────────

describe('GOJSONFieldExtractor edge cases', () => {
  const extractor = new GOJSONFieldExtractor({ parseEmbeddedJson: true });

  it('handles empty object', () => {
    assert.strictEqual(extractor.extract({}, 'any'), undefined);
  });

  it('handles empty array', () => {
    assert.strictEqual(extractor.extract([], 'any'), undefined);
  });

  it('handles deeply nested structure without stack overflow', () => {
    // Build 60 levels deep - exceeds default maxDepth of 50
    let obj: Record<string, unknown> = { target: 'found' };
    for (let i = 0; i < 60; i++) {
      obj = { nested: obj };
    }
    // Default maxDepth is 50, so target at depth 61 should not be found
    const defaultExtractor = new GOJSONFieldExtractor();
    assert.strictEqual(defaultExtractor.extractByKey(obj, 'target'), undefined);

    // With higher maxDepth it should be found
    const deepExtractor = new GOJSONFieldExtractor({ maxDepth: 100 });
    assert.strictEqual(deepExtractor.extractByKey(obj, 'target'), 'found');
  });

  it('handles objects with numeric-like keys', () => {
    const obj = { '0': 'zero', '1': 'one' };
    assert.strictEqual(extractor.extractByPath(obj, '0'), 'zero');
  });

  it('handles value that is explicitly undefined', () => {
    const obj = { key: undefined };
    // extractByKey returns undefined — same as "not found"
    // but extractByPath should also return undefined since the value IS undefined
    assert.strictEqual(extractor.extractByPath(obj, 'key'), undefined);
  });

  it('handles circular-like structures (not truly circular, but repeated references)', () => {
    const shared = { id: 'shared-ref' };
    const obj = { a: shared, b: shared, c: { inner: shared } };
    assert.strictEqual(extractor.extractByKey(obj, 'id'), 'shared-ref');
  });

  it('extracts from object with prototype chain properties', () => {
    const proto = { inherited: 'proto-value' };
    const obj = Object.create(proto) as Record<string, unknown>;
    obj['own'] = 'own-value';
    // extractByKey uses hasOwnProperty, so inherited should NOT be found
    assert.strictEqual(extractor.extractByKey(obj, 'own'), 'own-value');
    assert.strictEqual(extractor.extractByKey(obj, 'inherited'), undefined);
  });

  it('handles special characters in key names', () => {
    const obj = { 'key-with-dashes': 'dash', key_with_underscores: 'under' };
    assert.strictEqual(extractor.extractByKey(obj, 'key-with-dashes'), 'dash');
    assert.strictEqual(extractor.extractByKey(obj, 'key_with_underscores'), 'under');
  });

  it('handles large flat object efficiently', () => {
    const obj: Record<string, number> = {};
    for (let i = 0; i < 10000; i++) {
      obj[`key_${i}`] = i;
    }
    assert.strictEqual(extractor.extractByKey(obj, 'key_9999'), 9999);
  });
});
