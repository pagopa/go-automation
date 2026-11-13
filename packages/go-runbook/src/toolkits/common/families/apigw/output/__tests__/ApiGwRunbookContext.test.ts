import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { isApiGwRunbookContext } from '../ApiGwRunbookContext.js';

describe('isApiGwRunbookContext', () => {
  it('accepts a complete API Gateway runbook context', () => {
    assert.strictEqual(
      isApiGwRunbookContext({
        kind: 'apigw',
        apiGwLogGroup: 'access-log-group',
        queryProfileId: 'send',
        services: [{ name: 'pn-delivery', varPrefix: 'delivery', logGroup: '/aws/ecs/pn-delivery' }],
      }),
      true,
    );
  });

  it('rejects contexts missing required top-level strings', () => {
    assert.strictEqual(
      isApiGwRunbookContext({
        kind: 'apigw',
        queryProfileId: 'send',
        services: [{ name: 'pn-delivery', varPrefix: 'delivery', logGroup: '/aws/ecs/pn-delivery' }],
      }),
      false,
    );
    assert.strictEqual(
      isApiGwRunbookContext({
        kind: 'apigw',
        apiGwLogGroup: 'access-log-group',
        queryProfileId: ' ',
        services: [{ name: 'pn-delivery', varPrefix: 'delivery', logGroup: '/aws/ecs/pn-delivery' }],
      }),
      false,
    );
  });

  it('rejects malformed service entries', () => {
    assert.strictEqual(
      isApiGwRunbookContext({
        kind: 'apigw',
        apiGwLogGroup: 'access-log-group',
        queryProfileId: 'send',
        services: [{ name: 'pn-delivery', varPrefix: 'delivery' }],
      }),
      false,
    );
    assert.strictEqual(
      isApiGwRunbookContext({
        kind: 'apigw',
        apiGwLogGroup: 'access-log-group',
        queryProfileId: 'send',
        services: [{ name: 'pn-delivery', varPrefix: '', logGroup: '/aws/ecs/pn-delivery' }],
      }),
      false,
    );
  });
});
