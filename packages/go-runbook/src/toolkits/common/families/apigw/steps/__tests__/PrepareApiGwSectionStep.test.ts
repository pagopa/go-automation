import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { CollectingRunbookReporter } from '../../../../../../engine/reporting/CollectingRunbookReporter.js';
import { PrepareApiGwSectionStep } from '../PrepareApiGwSectionStep.js';
import { createTestContext } from '../../../../../../__tests__/helpers/createTestContext.js';

describe('PrepareApiGwSectionStep', () => {
  it('opens one section with the log group, producing no output and no vars', async () => {
    const reporter = new CollectingRunbookReporter();
    const step = new PrepareApiGwSectionStep({
      id: 'prepare-api-gw-section',
      label: 'Preparazione API Gateway',
      apiGwLogGroup: '/aws/apigateway/pn-delivery-B2B',
    });

    const result = await step.execute(createTestContext({ services: { reporter } }));

    assert.deepStrictEqual(result, { success: true });
    assert.deepStrictEqual(reporter.sections, ['Preparazione: query API Gateway']);
    assert.deepStrictEqual(reporter.nodes, [{ label: 'Log group: /aws/apigateway/pn-delivery-B2B' }]);
  });
});
