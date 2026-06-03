import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { deriveBuilderName } from '../naming/deriveBuilderName.js';

describe('deriveBuilderName', () => {
  it('matches the existing pn-delivery-B2B builder name', () => {
    assert.strictEqual(deriveBuilderName('pn-delivery-B2B-ApiGwAlarm'), 'buildDeliveryB2BApiGwAlarmRunbook');
  });

  it('drops the leading pn- prefix', () => {
    assert.strictEqual(deriveBuilderName('pn-foo'), 'buildFooRunbook');
  });

  it('works without a pn- prefix', () => {
    assert.strictEqual(deriveBuilderName('custom-thing'), 'buildCustomThingRunbook');
  });
});
