import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { valueToString, safeJsonStringify } from '../GOValueToString.js';
import type { GOValueToStringOptions } from '../GOValueToString.js';

describe('GOValueToString', () => {
  it('converts nullish values, primitives, symbols, functions and RegExps', () => {
    const cases: ReadonlyArray<readonly [value: unknown, options: GOValueToStringOptions, expected: string]> = [
      [null, {}, ''],
      [undefined, {}, ''],
      [null, { nullValue: 'NULL' }, 'NULL'],
      [undefined, { undefinedValue: 'UNDEF' }, 'UNDEF'],
      ['hello', {}, 'hello'],
      ['hello', { quoteStrings: true }, '"hello"'],
      [42, {}, '42'],
      [false, {}, 'false'],
      [123n, {}, '123'],
      [Symbol('desc'), {}, 'desc'],
      [Symbol(), {}, ''],
      [() => undefined, {}, ''],
      [/abc/i, {}, '/abc/i'],
    ];
    for (const [value, options, expected] of cases) {
      assert.strictEqual(valueToString(value, options), expected, String(value));
    }
  });

  it('formats Dates and Buffers as configured', () => {
    const date = new Date('2024-01-29T10:30:00.000Z');
    assert.strictEqual(valueToString(date), '2024-01-29T10:30:00.000Z');
    assert.strictEqual(valueToString(date, { dateFormat: 'timestamp' }), String(date.getTime()));
    // Locale output depends on the environment: only check it is produced.
    assert.ok(valueToString(date, { dateFormat: 'locale' }).length > 0);

    const buf = Buffer.from('hello');
    assert.strictEqual(valueToString(buf), buf.toString('base64'));
    assert.strictEqual(valueToString(buf, { bufferFormat: 'utf8' }), 'hello');
    assert.strictEqual(valueToString(buf, { bufferFormat: 'hex' }), buf.toString('hex'));
  });

  it('serializes Errors, Maps, Sets, Arrays and objects, handling cycles and maxDepth', () => {
    assert.deepStrictEqual(
      JSON.parse(valueToString(new Error('oops'))) as unknown,
      JSON.parse(JSON.stringify({ name: 'Error', message: 'oops' })) as unknown,
    );
    assert.strictEqual(
      valueToString(
        new Map([
          ['a', 1],
          ['b', 2],
        ]),
      ),
      '{"a":1,"b":2}',
    );
    assert.strictEqual(valueToString(new Set([1, 2, 3])), '[1,2,3]');
    assert.strictEqual(valueToString([1, '2', true]), '[1,"2",true]');
    assert.strictEqual(valueToString([1, '2', true], { arrayJoin: '|' }), '1|2|true');

    const circular: Record<string, unknown> = { a: 1 };
    circular['self'] = circular;
    assert.strictEqual(valueToString(circular), '{"a":1,"self":"[Circular]"}');
    assert.strictEqual(valueToString({ a: { b: { c: { d: 1 } } } }, { maxDepth: 1 }), '{"a":{"b":"[Max Depth]"}}');
  });

  it('safeJsonStringify handles BigInt, non-circular mode and genuinely-deep nesting', () => {
    assert.strictEqual(safeJsonStringify({ b: 123n }), '{"b":"123"}');
    assert.strictEqual(safeJsonStringify({ a: 1 }, { handleCircular: false }), '{"a":1}');
    assert.strictEqual(safeJsonStringify({ a: { b: { c: 1 } } }, { maxDepth: 1 }), '{"a":{"b":"[Max Depth]"}}');
  });

  it('safeJsonStringify does not truncate wide-but-shallow objects (depth is per-path, not cumulative)', () => {
    const configuration: Record<string, { value: string; source: string }> = {};
    for (let i = 0; i < 30; i++) {
      configuration[`param.${String(i)}`] = { value: `v${String(i)}`, source: 'env' };
    }

    const out = safeJsonStringify({ data: { configuration } });
    assert.ok(!out.includes('[Max Depth]'), `no entry should be truncated: ${out}`);
    const parsed = JSON.parse(out) as { data: { configuration: Record<string, { value: string; source: string }> } };
    assert.deepStrictEqual(parsed.data.configuration['param.29'], { value: 'v29', source: 'env' });
  });
});
