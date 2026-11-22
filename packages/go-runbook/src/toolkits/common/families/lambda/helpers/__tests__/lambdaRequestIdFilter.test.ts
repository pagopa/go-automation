import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { lambdaInvocationQuery, sampleLambdaInvocationQuery } from '../lambdaRequestIdFilter.js';

const TEMPLATE = 'fields @message | filter {{REQUEST_ID_FILTER}}';

describe('lambdaInvocationQuery', () => {
  it('replaces the placeholder with one predicate per request id, in OR', () => {
    assert.strictEqual(
      lambdaInvocationQuery(TEMPLATE, ['req-1', 'req-2']),
      "fields @message | filter (@requestId = 'req-1' or @message like 'req-1') or " +
        "(@requestId = 'req-2' or @message like 'req-2')",
    );
  });

  it('rejects a value that is not a request id and a template without the placeholder', () => {
    assert.throws(() => lambdaInvocationQuery(TEMPLATE, ["x' or 1=1"]), /invalid Lambda requestId/u);
    assert.throws(() => lambdaInvocationQuery('fields @message', ['req-1']), /missing required placeholder/u);
  });

  it('shows a sample query for the trace', () => {
    assert.match(sampleLambdaInvocationQuery(TEMPLATE), /@requestId = '00000000-0000-0000-0000-000000000000'/u);
  });
});
