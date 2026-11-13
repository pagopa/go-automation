import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isInteropApiGwRunbookContext } from '../../toolkits/interop/families/apigw/output/InteropApiGwRunbookContext.js';
import { isInteropK8sRunbookContext } from '../../toolkits/interop/families/k8s/output/InteropK8sRunbookContext.js';
import { isSendApiGwRunbookContext } from '../../toolkits/send/families/apigw/output/SendApiGwRunbookContext.js';

const API_GW = {
  kind: 'apigw',
  apiGwLogGroup: 'access-log-group',
  queryProfileId: 'p',
  services: [{ name: 'svc', varPrefix: 'svc', logGroup: '/aws/ecs/svc' }],
};
const SERVICE = { kind: 'service', queryProfileId: 'p', service: { name: 'svc', logGroup: '/l', varPrefix: 'svc' } };

describe('product-family runbook contexts (EVO-RBREORG-OPUS-01 P19)', () => {
  it('splits API Gateway contexts by product', () => {
    assert.strictEqual(isSendApiGwRunbookContext({ ...API_GW, product: 'SEND' }), true);
    assert.strictEqual(isSendApiGwRunbookContext({ ...API_GW, product: 'INTEROP' }), false);
    assert.strictEqual(isInteropApiGwRunbookContext({ ...API_GW, product: 'INTEROP' }), true);
    assert.strictEqual(isInteropApiGwRunbookContext({ ...API_GW, product: 'SEND' }), false);
  });

  it('recognises an INTEROP K8S context among the service ones', () => {
    assert.strictEqual(isInteropK8sRunbookContext({ ...SERVICE, product: 'INTEROP' }), true);
    assert.strictEqual(isInteropK8sRunbookContext({ ...SERVICE, product: 'SEND' }), false);
  });

  it('rejects contexts without a product', () => {
    assert.strictEqual(isSendApiGwRunbookContext(API_GW), false);
    assert.strictEqual(isInteropApiGwRunbookContext(API_GW), false);
    assert.strictEqual(isInteropK8sRunbookContext(SERVICE), false);
  });
});
