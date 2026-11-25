import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GOLambdaEventConfigProvider } from '../GOLambdaEventConfigProvider.js';

describe('GOLambdaEventConfigProvider', () => {
  it('normalizes event keys and primitive values into configuration entries', () => {
    const provider = new GOLambdaEventConfigProvider({
      'already.dot': 'dot',
      snake_case: 'snake',
      camelCase: 'camel',
      numberValue: 42,
      boolValue: false,
      listValue: ['one', 2, true, null, undefined, { skipped: true }],
      emptyList: [null, undefined, {}],
      objectValue: { skipped: true },
      nullValue: null,
      undefinedValue: undefined,
      constructor: 'blocked',
      prototype: 'blocked',
    });

    assert.strictEqual(provider.getName(), 'LambdaEvent');
    assert.strictEqual(provider.getValue('already.dot'), 'dot');
    assert.strictEqual(provider.getValue('snake.case'), 'snake');
    assert.strictEqual(provider.getValue('camel.case'), 'camel');
    assert.strictEqual(provider.getValue('number.value'), '42');
    assert.strictEqual(provider.getValue('bool.value'), 'false');
    assert.deepStrictEqual(provider.getValue('list.value'), ['one', '2', 'true']);
    assert.strictEqual(provider.getValue('empty.list'), undefined);
    assert.strictEqual(provider.getValue('object.value'), undefined);
    assert.strictEqual(provider.getValue('null.value'), undefined);
    assert.strictEqual(provider.getValue('undefined.value'), undefined);
    assert.strictEqual(provider.getValue('constructor'), undefined);
    assert.strictEqual(provider.getValue('prototype'), undefined);
    assert.strictEqual(provider.isSecret('list.value'), false);
    assert.strictEqual(provider.isSecret('missing'), false);
  });

  it('updates values in place and removes entries from previous invocations', () => {
    const provider = new GOLambdaEventConfigProvider({
      firstValue: 'first',
      staleValue: 'stale',
    });

    provider.updateValues({
      second_value: 'second',
      count: 3,
    });

    assert.strictEqual(provider.getValue('first.value'), undefined);
    assert.strictEqual(provider.getValue('stale.value'), undefined);
    assert.strictEqual(provider.getValue('second.value'), 'second');
    assert.strictEqual(provider.getValue('count'), '3');
    assert.deepStrictEqual(provider.getAllKeys().sort(), ['count', 'second.value']);
  });
});
