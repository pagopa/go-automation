import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AttributeValue } from '@pagopa/go-aws/dynamodb';

import type { RunbookDynamoDBAttributeValue } from '../RunbookDynamoDBAttributeValue.js';

describe('RunbookDynamoDBAttributeValue', () => {
  it('accepts exactly one attribute kind per value and stays assignable to the SDK AttributeValue', () => {
    const values: ReadonlyArray<RunbookDynamoDBAttributeValue> = [
      { S: 'a' },
      { N: '1' },
      { BOOL: true },
      { NULL: true },
    ];
    // Compile-time check: every port value is a valid SDK AttributeValue.
    const sdkValues: ReadonlyArray<AttributeValue> = values;

    // @ts-expect-error -- two attribute kinds in one value are rejected, as in the SDK union
    const mixed: RunbookDynamoDBAttributeValue = { S: 'a', N: '1' };

    assert.strictEqual(sdkValues.length, 4);
    assert.deepStrictEqual(mixed, { S: 'a', N: '1' });
  });
});
