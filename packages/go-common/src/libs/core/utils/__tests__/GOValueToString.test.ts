import { describe, it } from 'node:test';
import assert from 'node:assert';
import { valueToString, safeJsonStringify } from '../GOValueToString.js';

describe('GOValueToString', () => {
  it('handles null and undefined', () => {
    assert.strictEqual(valueToString(null), '');
    assert.strictEqual(valueToString(undefined), '');
    assert.strictEqual(valueToString(null, { nullValue: 'NULL' }), 'NULL');
    assert.strictEqual(valueToString(undefined, { undefinedValue: 'UNDEF' }), 'UNDEF');
  });

  it('handles primitives', () => {
    assert.strictEqual(valueToString('hello'), 'hello');
    assert.strictEqual(valueToString('hello', { quoteStrings: true }), '"hello"');
    assert.strictEqual(valueToString(42), '42');
    assert.strictEqual(valueToString(true), 'true');
    assert.strictEqual(valueToString(false), 'false');
    assert.strictEqual(valueToString(123n), '123');
  });

  it('handles symbols and functions', () => {
    assert.strictEqual(valueToString(Symbol('desc')), 'desc');
    assert.strictEqual(valueToString(Symbol()), '');
    assert.strictEqual(valueToString(() => {}), '');
  });

  it('handles Dates', () => {
    const date = new Date('2024-01-29T10:30:00.000Z');
    assert.strictEqual(valueToString(date), '2024-01-29T10:30:00.000Z');
    assert.strictEqual(valueToString(date, { dateFormat: 'timestamp' }), date.getTime().toString());
    // Locale might vary by environment, so we just check it doesn't crash
    assert.ok(valueToString(date, { dateFormat: 'locale' }).length > 0);
  });

  it('handles Buffers', () => {
    const buf = Buffer.from('hello');
    assert.strictEqual(valueToString(buf), buf.toString('base64'));
    assert.strictEqual(valueToString(buf, { bufferFormat: 'utf8' }), 'hello');
    assert.strictEqual(valueToString(buf, { bufferFormat: 'hex' }), buf.toString('hex'));
  });

  it('handles Errors', () => {
    const err = new Error('oops');
    const result = JSON.parse(valueToString(err));
    assert.strictEqual(result.name, 'Error');
    assert.strictEqual(result.message, 'oops');
  });

  it('handles RegExps', () => {
    const re = /abc/i;
    assert.strictEqual(valueToString(re), '/abc/i');
  });

  it('handles Maps and Sets', () => {
    const map = new Map([['a', 1], ['b', 2]]);
    assert.strictEqual(valueToString(map), '{"a":1,"b":2}');
    
    const set = new Set([1, 2, 3]);
    assert.strictEqual(valueToString(set), '[1,2,3]');
  });

  it('handles Arrays', () => {
    const arr = [1, '2', true];
    assert.strictEqual(valueToString(arr), '[1,"2",true]');
    assert.strictEqual(valueToString(arr, { arrayJoin: '|' }), '1|2|true');
  });

  it('handles Objects and Circular References', () => {
    const obj: any = { a: 1 };
    obj.self = obj;
    assert.strictEqual(valueToString(obj), '{"a":1,"self":"[Circular]"}');
  });

  it('respects maxDepth', () => {
    const deepObj = { a: { b: { c: { d: 1 } } } };
    assert.strictEqual(valueToString(deepObj, { maxDepth: 1 }), '{"a":{"b":"[Max Depth]"}}');
  });

  it('safeJsonStringify handles BigInt and non-circular mode', () => {
    assert.strictEqual(safeJsonStringify({ b: 123n }), '{"b":"123"}');
    assert.strictEqual(safeJsonStringify({ a: 1 }, { handleCircular: false }), '{"a":1}');
  });
});
