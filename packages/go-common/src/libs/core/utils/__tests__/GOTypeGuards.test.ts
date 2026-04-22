import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  hasMessage,
  hasProperty,
  isArray,
  isBigInt,
  isBoolean,
  isBuffer,
  isDate,
  isError,
  isFunction,
  isMap,
  isNodeError,
  isNonEmptyArray,
  isNonEmptyString,
  isNullish,
  isNumber,
  isObject,
  isPlainObject,
  isPrimitive,
  isPromise,
  isRegExp,
  isSet,
  isString,
  isSymbol,
  isValidDate,
} from '../GOTypeGuards.js';

describe('GOTypeGuards', () => {
  it('covers primitive and nullish guards', () => {
    assert.strictEqual(isNullish(null), true);
    assert.strictEqual(isNullish(undefined), true);
    assert.strictEqual(isNullish(0), false);

    assert.strictEqual(isPrimitive('value'), true);
    assert.strictEqual(isPrimitive(42), true);
    assert.strictEqual(isPrimitive(true), true);
    assert.strictEqual(isPrimitive(123n), true);
    assert.strictEqual(isPrimitive(null), true);
    assert.strictEqual(isPrimitive(undefined), true);
    assert.strictEqual(isPrimitive(Symbol('nope')), false);
    assert.strictEqual(isPrimitive({ key: 'value' }), false);
  });

  it('covers object, array, and structural guards', () => {
    assert.strictEqual(isPlainObject({ a: 1 }), true);
    assert.strictEqual(isPlainObject(Object.create(null)), true);
    assert.strictEqual(isPlainObject([]), false);
    assert.strictEqual(isPlainObject(new Date()), false);
    assert.strictEqual(isPlainObject(null), false);

    assert.strictEqual(isObject({}), true);
    assert.strictEqual(isObject([]), true);
    assert.strictEqual(isObject(new Date()), true);
    assert.strictEqual(isObject(null), false);
    assert.strictEqual(isObject('text'), false);

    assert.strictEqual(isArray([1, 2, 3]), true);
    assert.strictEqual(isArray('not-an-array'), false);

    assert.strictEqual(hasProperty({ id: 1 }, 'id'), true);
    assert.strictEqual(hasProperty({ id: 1 }, 'missing'), false);

    assert.strictEqual(hasMessage({ message: 'boom' }), true);
    assert.strictEqual(hasMessage({ message: 42 }), true);
    assert.strictEqual(hasMessage('boom'), false);
  });

  it('covers scalar guards', () => {
    assert.strictEqual(isString('value'), true);
    assert.strictEqual(isString(1), false);

    assert.strictEqual(isNumber(42), true);
    assert.strictEqual(isNumber(Number.NaN), false);
    assert.strictEqual(isNumber('42'), false);

    assert.strictEqual(isBoolean(false), true);
    assert.strictEqual(isBoolean('false'), false);

    assert.strictEqual(
      isFunction(() => undefined),
      true,
    );
    assert.strictEqual(isFunction({}), false);

    assert.strictEqual(isSymbol(Symbol('s')), true);
    assert.strictEqual(isSymbol('s'), false);

    assert.strictEqual(isBigInt(10n), true);
    assert.strictEqual(isBigInt(10), false);
  });

  it('covers instance-based guards', async () => {
    const error = new Error('boom');
    const nodeError = Object.assign(new Error('enoent'), { code: 'ENOENT' });
    const invalidDate = new Date('invalid');
    const promise = Promise.resolve('ok');

    assert.strictEqual(isError(error), true);
    assert.strictEqual(isError({ message: 'boom' }), false);

    assert.strictEqual(isNodeError(nodeError), true);
    assert.strictEqual(isNodeError(error), false);

    assert.strictEqual(isDate(new Date()), true);
    assert.strictEqual(isDate('2025-01-01'), false);

    assert.strictEqual(isValidDate(new Date('2025-01-01')), true);
    assert.strictEqual(isValidDate(invalidDate), false);

    assert.strictEqual(isBuffer(Buffer.from('hello')), true);
    assert.strictEqual(isBuffer(new Uint8Array([1, 2, 3])), false);

    assert.strictEqual(isMap(new Map()), true);
    assert.strictEqual(isMap({}), false);

    assert.strictEqual(isSet(new Set()), true);
    assert.strictEqual(isSet([]), false);

    assert.strictEqual(isRegExp(/abc/u), true);
    assert.strictEqual(isRegExp('abc'), false);

    assert.strictEqual(isPromise(promise), true);
    assert.strictEqual(isPromise({ then: () => undefined }), false);

    await promise;
  });

  it('covers non-empty guards', () => {
    assert.strictEqual(isNonEmptyString('hello'), true);
    assert.strictEqual(isNonEmptyString(''), false);
    assert.strictEqual(isNonEmptyString(123), false);

    assert.strictEqual(isNonEmptyArray([1]), true);
    assert.strictEqual(isNonEmptyArray([]), false);
    assert.strictEqual(isNonEmptyArray('no'), false);
  });
});
