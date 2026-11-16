import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isLambdaRunbookContext } from '../../../toolkits/common/families/lambda/output/LambdaRunbookContext.js';
import { isServiceRunbookContext } from '../../../toolkits/common/families/service/output/ServiceRunbookContext.js';
import { isInteropApiGwRunbookContext } from '../../../toolkits/interop/families/apigw/output/InteropApiGwRunbookContext.js';
import { isInteropK8sRunbookContext } from '../../../toolkits/interop/families/k8s/output/InteropK8sRunbookContext.js';
import { isSendApiGwRunbookContext } from '../../../toolkits/send/families/apigw/output/SendApiGwRunbookContext.js';
import { RUNBOOK_CATALOG } from '../runbookRegistry.js';

/** Product family of a built context, as a consumer without the catalog registration sees it. */
function familyOf(context: unknown): string {
  if (isSendApiGwRunbookContext(context)) return 'SEND apigw';
  if (isInteropApiGwRunbookContext(context)) return 'INTEROP apigw';
  if (isInteropK8sRunbookContext(context)) return 'INTEROP k8s';
  if (isServiceRunbookContext(context)) return `${context.product} service`;
  if (isLambdaRunbookContext(context)) return `${context.product} lambda`;
  return 'none';
}

describe('runbookContext product family (EVO-RBREORG-OPUS-01 P19)', () => {
  const families = new Map<string, number>();
  for (const descriptor of RUNBOOK_CATALOG.listDescriptors()) {
    const resolved = RUNBOOK_CATALOG.resolveByKey(descriptor.key);
    const context = resolved?.build().runbookContext;
    const family = familyOf(context);
    families.set(family, (families.get(family) ?? 0) + 1);

    if (context === undefined) continue;
    it(`${descriptor.key}: the context declares the product of its registration`, () => {
      assert.strictEqual(context.product, resolved?.product);
    });
  }

  it('tells the SEND pipeline apart from the INTEROP API Gateway and K8S runbooks', () => {
    assert.ok((families.get('SEND apigw') ?? 0) > 0, 'SEND API Gateway runbooks');
    assert.ok((families.get('INTEROP apigw') ?? 0) > 0, 'INTEROP API Gateway runbooks');
    assert.ok((families.get('INTEROP k8s') ?? 0) > 0, 'INTEROP K8S runbooks');
    assert.ok((families.get('SEND service') ?? 0) > 0, 'SEND service runbooks');
    assert.strictEqual(families.get('INTEROP service'), undefined, 'every INTEROP service context is a K8S one');
  });
});
