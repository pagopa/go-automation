import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GOConfigParameterType, getTypePlaceholder } from '../GOConfigParameterType.js';
import { GOConfigTypeConverter } from '../GOConfigTypeConverter.js';
import { GOSecretRedactor, GOSecretsSpecifierFactory } from '../GOSecretsSpecifier.js';

describe('GOConfigTypeConverter', () => {
  it('converts scalar configuration values', () => {
    assert.strictEqual(GOConfigTypeConverter.toString(['first']), 'first');
    assert.strictEqual(GOConfigTypeConverter.toString([]), '');
    assert.strictEqual(GOConfigTypeConverter.toInt('42'), 42);
    assert.strictEqual(GOConfigTypeConverter.toDouble('3.5'), 3.5);
    assert.strictEqual(GOConfigTypeConverter.toBool('yes'), true);
    assert.strictEqual(GOConfigTypeConverter.toBool('off'), false);

    assert.throws(() => GOConfigTypeConverter.toString(['first', 'second']), /multiple values/);
    assert.throws(() => GOConfigTypeConverter.toInt('not-a-number'), /Cannot convert/);
    assert.throws(() => GOConfigTypeConverter.toDouble('not-a-number'), /Cannot convert/);
    assert.throws(() => GOConfigTypeConverter.toBool('maybe'), /Cannot convert/);
  });

  it('converts array configuration values', () => {
    assert.deepStrictEqual(GOConfigTypeConverter.toStringArray(' a, b ,, c '), ['a', 'b', 'c']);
    assert.deepStrictEqual(GOConfigTypeConverter.toStringArray(['x', 'y']), ['x', 'y']);
    assert.deepStrictEqual(GOConfigTypeConverter.toStringArray(''), []);
    assert.deepStrictEqual(GOConfigTypeConverter.toIntArray('1, 2'), [1, 2]);
    assert.deepStrictEqual(GOConfigTypeConverter.toDoubleArray('1.5, 2.25'), [1.5, 2.25]);
    assert.deepStrictEqual(GOConfigTypeConverter.toBoolArray('true,false,on'), [true, false, true]);

    assert.throws(() => GOConfigTypeConverter.toIntArray('1,x'), /Cannot convert/);
    assert.throws(() => GOConfigTypeConverter.toDoubleArray('1,x'), /Cannot convert/);
  });

  it('converts buffer values and supports safe fallback conversion', () => {
    const encoded = Buffer.from('hello', 'utf8').toString('base64');

    assert.strictEqual(GOConfigTypeConverter.toBuffer(encoded).toString('utf8'), 'hello');
    assert.deepStrictEqual(
      GOConfigTypeConverter.toBufferArray(`${encoded},${encoded}`).map((buffer) => buffer.toString('utf8')),
      ['hello', 'hello'],
    );
    assert.strictEqual(
      GOConfigTypeConverter.tryConvert(GOConfigTypeConverter.toInt.bind(GOConfigTypeConverter), '8', 7),
      8,
    );
    assert.strictEqual(
      GOConfigTypeConverter.tryConvert(GOConfigTypeConverter.toInt.bind(GOConfigTypeConverter), 'bad', 7),
      7,
    );
    assert.strictEqual(
      GOConfigTypeConverter.tryConvert(GOConfigTypeConverter.toInt.bind(GOConfigTypeConverter), undefined, 7),
      7,
    );
  });
});

describe('GOConfigParameterType', () => {
  it('returns display placeholders for known and unknown parameter types', () => {
    assert.strictEqual(getTypePlaceholder(GOConfigParameterType.STRING), '<value>');
    assert.strictEqual(getTypePlaceholder(GOConfigParameterType.INT), '<number>');
    assert.strictEqual(getTypePlaceholder(GOConfigParameterType.DOUBLE), '<decimal>');
    assert.strictEqual(getTypePlaceholder(GOConfigParameterType.BOOL), '');
    assert.strictEqual(getTypePlaceholder(GOConfigParameterType.STRING_ARRAY), '<value1,value2,...>');
    assert.strictEqual(getTypePlaceholder(GOConfigParameterType.INT_ARRAY), '<num1,num2,...>');
    assert.strictEqual(getTypePlaceholder(GOConfigParameterType.DOUBLE_ARRAY), '<dec1,dec2,...>');
    assert.strictEqual(getTypePlaceholder(GOConfigParameterType.BOOL_ARRAY), '<true,false,...>');
    assert.strictEqual(getTypePlaceholder(GOConfigParameterType.BUFFER), '<base64>');
    assert.strictEqual(getTypePlaceholder(GOConfigParameterType.BUFFER_ARRAY), '<base64,base64,...>');
    assert.strictEqual(getTypePlaceholder('unknown' as GOConfigParameterType), '<value>');
  });
});

describe('GOSecretRedactor', () => {
  it('supports all secret specifier modes and redacts scalar and array values', () => {
    const allRedactor = new GOSecretRedactor(GOSecretsSpecifierFactory.all());
    const dynamicRedactor = new GOSecretRedactor(
      GOSecretsSpecifierFactory.dynamic(
        (key, value) => key === 'secret' && GOConfigTypeConverter.toString(value) !== '',
      ),
    );

    assert.strictEqual(new GOSecretRedactor().isSecret('token', 'value'), false);
    assert.strictEqual(allRedactor.isSecret('anything', 'value'), true);
    assert.strictEqual(
      new GOSecretRedactor(GOSecretsSpecifierFactory.specific(['token'])).isSecret('token', 'x'),
      true,
    );
    assert.strictEqual(dynamicRedactor.isSecret('secret', 'x'), true);
    assert.strictEqual(allRedactor.redact('abcdef'), '[REDACTED (6 chars)]');
    assert.strictEqual(allRedactor.redact(['a', 'b']), '[REDACTED (2 items)]');
  });
});
