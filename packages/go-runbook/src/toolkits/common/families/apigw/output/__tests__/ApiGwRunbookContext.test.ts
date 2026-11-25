import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { isApiGwRunbookContext } from '../ApiGwRunbookContext.js';

const SERVICE = { name: 'pn-delivery', varPrefix: 'delivery', logGroup: '/aws/ecs/pn-delivery' };
const VALID = {
  kind: 'apigw',
  product: 'SEND',
  apiGwLogGroup: 'access-log-group',
  queryProfileId: 'send',
  services: [SERVICE],
};

describe('isApiGwRunbookContext', () => {
  it('accepts a complete API Gateway runbook context of any known product', () => {
    assert.strictEqual(isApiGwRunbookContext(VALID), true);
    assert.strictEqual(isApiGwRunbookContext({ ...VALID, product: 'INTEROP' }), true);
  });

  it('rejects a missing or blank top-level field, an unknown product and a malformed service', () => {
    const { apiGwLogGroup: _omitted, ...withoutLogGroup } = VALID;
    const { product: _none, ...withoutProduct } = VALID;
    for (const invalid of [
      withoutLogGroup,
      withoutProduct,
      { ...VALID, queryProfileId: ' ' },
      { ...VALID, product: 'OTHER' },
      { ...VALID, services: [{ name: 'pn-delivery', varPrefix: 'delivery' }] },
      { ...VALID, services: [{ ...SERVICE, varPrefix: '' }] },
    ]) {
      assert.strictEqual(isApiGwRunbookContext(invalid), false, JSON.stringify(invalid));
    }
  });
});
